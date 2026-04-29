import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { extractTextFromBuffer } from "@/lib/reference-extract";

const MAX_REFERENCES_PER_PROJECT = 200;
const MAX_PDF_BYTES = 50 * 1024 * 1024;

const paperSchema = z.object({
  title: z.string().min(1).max(1000),
  authors: z.array(z.string()).default([]),
  year: z.number().int().min(1500).max(3000).optional(),
  abstract: z.string().max(20000).optional(),
  url: z.string().url().optional(),
  pdfUrl: z.string().url().optional(),
  doi: z.string().max(512).optional(),
  citationCount: z.number().int().min(0).optional(),
  source: z.enum(["semantic_scholar", "openalex", "crossref", "arxiv"]),
});

const bodySchema = z.object({
  papers: z.array(paperSchema).min(1).max(100),
});

function safeFilename(title: string, hasPdf: boolean) {
  const base = title
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return `${base || "reference"}${hasPdf ? ".pdf" : ".txt"}`;
}

function dedupeKey(p: z.infer<typeof paperSchema>) {
  const doi = (p.doi || "").trim().toLowerCase();
  if (doi) return `doi:${doi}`;
  const url = (p.url || p.pdfUrl || "").trim().toLowerCase();
  if (url) return `url:${url}`;
  const title = p.title.toLowerCase().replace(/\s+/g, " ").trim();
  return `title:${title}:${p.year || ""}`;
}

function metadataBlock(p: z.infer<typeof paperSchema>) {
  const lines = [
    "[ACADEMIC_REFERENCE_METADATA]",
    `title: ${p.title}`,
    `authors: ${p.authors.join(", ")}`,
    `year: ${p.year ?? ""}`,
    `doi: ${p.doi ?? ""}`,
    `url: ${p.url ?? ""}`,
    `pdfUrl: ${p.pdfUrl ?? ""}`,
    `source: ${p.source}`,
    `citationCount: ${p.citationCount ?? ""}`,
    "",
    p.abstract ? `abstract:\n${p.abstract}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

async function tryFetchPdfText(pdfUrl: string, title: string): Promise<{ sizeBytes: number; text: string } | null> {
  if (!pdfUrl.toLowerCase().startsWith("https://")) return null;

  let pdfRes: Response;
  try {
    pdfRes = await fetch(pdfUrl, {
      redirect: "follow",
      headers: { "User-Agent": "ThesisPilot/1.0 (open-access reference import)" },
    });
  } catch {
    return null;
  }

  if (!pdfRes.ok) return null;

  const lenHeader = pdfRes.headers.get("content-length");
  if (lenHeader) {
    const n = Number(lenHeader);
    if (Number.isFinite(n) && n > MAX_PDF_BYTES) return null;
  }

  const buf = Buffer.from(await pdfRes.arrayBuffer());
  if (buf.length > MAX_PDF_BYTES) return null;

  const ct = (pdfRes.headers.get("content-type") || "").toLowerCase();
  const looksPdfMagic = buf.length >= 4 && buf.subarray(0, 4).toString("ascii") === "%PDF";
  if (!looksPdfMagic && !ct.includes("pdf") && !pdfUrl.toLowerCase().includes(".pdf")) return null;

  try {
    const text = await extractTextFromBuffer(safeFilename(title, true), "application/pdf", buf);
    return { sizeBytes: buf.length, text };
  } catch {
    return null;
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project || project.userId !== session.user.id) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const raw = await request.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const existing = await prisma.referencePaper.findMany({
      where: { projectId: id },
      select: { originalName: true, extractedText: true },
    });

    const existingKeys = new Set<string>();
    for (const row of existing) {
      const meta = row.extractedText;
      const doi = meta.match(/\ndoi:\s*(.+)\s*$/m)?.[1]?.trim().toLowerCase();
      if (doi) existingKeys.add(`doi:${doi}`);
      const url = meta.match(/\nurl:\s*(.+)\s*$/m)?.[1]?.trim().toLowerCase();
      if (url) existingKeys.add(`url:${url}`);
      const title = meta.match(/\ntitle:\s*(.+)\s*$/m)?.[1]?.trim().toLowerCase();
      const year = meta.match(/\nyear:\s*(.+)\s*$/m)?.[1]?.trim();
      if (title) existingKeys.add(`title:${title.replace(/\s+/g, " ")}:${year || ""}`);
      existingKeys.add(`name:${row.originalName.toLowerCase()}`);
    }

    const toImport: z.infer<typeof paperSchema>[] = [];
    for (const p of parsed.data.papers) {
      const key = dedupeKey(p);
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      toImport.push(p);
    }

    const count = await prisma.referencePaper.count({ where: { projectId: id } });
    const slotsLeft = Math.max(0, MAX_REFERENCES_PER_PROJECT - count);
    const finalList = toImport.slice(0, slotsLeft);

    let created = 0;
    let pdfAttached = 0;
    let metadataOnly = 0;

    for (const p of finalList) {
      const pdf = p.pdfUrl ? await tryFetchPdfText(p.pdfUrl, p.title) : null;
      const metadata = metadataBlock(p);
      const extractedText = pdf ? `${metadata}\n\n${pdf.text}` : metadata;

      await prisma.referencePaper.create({
        data: {
          projectId: id,
          originalName: safeFilename(p.title, Boolean(pdf)),
          mimeType: pdf ? "application/pdf" : "text/academic-reference",
          sizeBytes: pdf?.sizeBytes ?? Buffer.byteLength(metadata, "utf8"),
          extractedText,
        },
      });
      created += 1;
      if (pdf) pdfAttached += 1;
      else metadataOnly += 1;
    }

    return NextResponse.json({
      success: true,
      created,
      pdfAttached,
      metadataOnly,
      skippedDuplicates: parsed.data.papers.length - toImport.length,
      skippedLimit: Math.max(0, toImport.length - finalList.length),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
