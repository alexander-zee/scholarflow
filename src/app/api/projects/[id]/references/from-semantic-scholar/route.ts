import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { extractTextFromBuffer } from "@/lib/reference-extract";
import { semanticScholarPaperForImport } from "@/lib/semantic-scholar";

const bodySchema = z
  .object({
    paperId: z.string().min(4).max(128).optional(),
    /** Direct PDF URL (e.g. arXiv). Must be HTTPS. */
    pdfUrl: z.string().url().optional(),
    title: z.string().max(500).optional(),
  })
  .refine((d) => Boolean(d.paperId || d.pdfUrl), { message: "Provide paperId or pdfUrl." });

const MAX_REFERENCES_PER_PROJECT = 200;
const MAX_PDF_BYTES = 50 * 1024 * 1024;

function safePdfFilename(title: string) {
  const base = title
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return `${base || "reference"}.pdf`;
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

    const count = await prisma.referencePaper.count({ where: { projectId: id } });
    if (count >= MAX_REFERENCES_PER_PROJECT) {
      return NextResponse.json(
        { error: `This project already has ${MAX_REFERENCES_PER_PROJECT} references. Remove one or upload fewer files per project.` },
        { status: 400 },
      );
    }

    const raw = await request.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    let pdfUrl: string;
    let titleForFile: string;

    if (parsed.data.paperId) {
      const { title, openAccessPdf } = await semanticScholarPaperForImport(parsed.data.paperId);
      const u = openAccessPdf?.url?.trim();
      if (!u) {
        return NextResponse.json(
          {
            error:
              "This paper has no open-access PDF in Semantic Scholar. Open the paper page and upload the PDF manually if you have access.",
          },
          { status: 400 },
        );
      }
      pdfUrl = u;
      titleForFile = title;
    } else {
      const u = parsed.data.pdfUrl!.trim();
      if (!u.toLowerCase().startsWith("https://")) {
        return NextResponse.json({ error: "PDF URL must use HTTPS." }, { status: 400 });
      }
      pdfUrl = u;
      titleForFile = parsed.data.title?.trim() || "Open access paper";
    }

    let pdfRes: Response;
    try {
      pdfRes = await fetch(pdfUrl, {
        redirect: "follow",
        headers: { "User-Agent": "ThesisPilot/1.0 (open-access reference import)" },
      });
    } catch {
      return NextResponse.json({ error: "Could not download the open-access PDF." }, { status: 502 });
    }

    if (!pdfRes.ok) {
      return NextResponse.json({ error: "Open-access PDF returned an error." }, { status: 502 });
    }

    const lenHeader = pdfRes.headers.get("content-length");
    if (lenHeader) {
      const n = Number(lenHeader);
      if (Number.isFinite(n) && n > MAX_PDF_BYTES) {
        return NextResponse.json({ error: "PDF is too large (max 50MB)." }, { status: 400 });
      }
    }

    const buf = Buffer.from(await pdfRes.arrayBuffer());
    if (buf.length > MAX_PDF_BYTES) {
      return NextResponse.json({ error: "PDF is too large (max 50MB)." }, { status: 400 });
    }

    const ct = (pdfRes.headers.get("content-type") || "").toLowerCase();
    const looksPdfMagic = buf.length >= 4 && buf.subarray(0, 4).toString("ascii") === "%PDF";
    if (!looksPdfMagic && !ct.includes("pdf") && !pdfUrl.toLowerCase().includes(".pdf")) {
      return NextResponse.json({ error: "Download was not a PDF." }, { status: 400 });
    }

    const originalName = safePdfFilename(titleForFile);
    let extractedText: string;
    try {
      extractedText = await extractTextFromBuffer(originalName, "application/pdf", buf);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Extraction failed.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    await prisma.referencePaper.create({
      data: {
        projectId: id,
        originalName,
        mimeType: "application/pdf",
        sizeBytes: buf.length,
        extractedText,
      },
    });

    return NextResponse.json({ success: true, created: 1, title: originalName });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
