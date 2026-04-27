import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { extractTextFromUpload } from "@/lib/reference-extract";

const MAX_FILES = 5;
const MAX_FILE_BYTES = 12 * 1024 * 1024;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.userId !== session.user.id) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const papers = await prisma.referencePaper.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
      extractedText: true,
    },
  });

  return NextResponse.json({
    references: papers.map((paper) => ({
      ...paper,
      createdAt: paper.createdAt.toISOString(),
      textPreview: paper.extractedText.replace(/\s+/g, " ").trim().slice(0, 400),
    })),
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.userId !== session.user.id) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const formData = await request.formData();
  const files = formData.getAll("files").filter((value): value is File => value instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "No files uploaded." }, { status: 400 });
  }

  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Too many files. Max is ${MAX_FILES}.` }, { status: 400 });
  }

  let created = 0;

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `File too large: ${file.name}` }, { status: 400 });
    }

    let extractedText = "";
    try {
      extractedText = await extractTextFromUpload(file);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Could not extract text from ${file.name}. Try TXT, DOCX, or a text-based PDF.`;
      return NextResponse.json({ error: `${file.name}: ${message}` }, { status: 400 });
    }

    await prisma.referencePaper.create({
      data: {
        projectId: id,
        originalName: file.name || "reference",
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        extractedText,
      },
    });
    created += 1;
  }

  return NextResponse.json({ success: true, created });
}
