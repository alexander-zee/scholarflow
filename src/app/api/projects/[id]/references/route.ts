import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { extractTextFromUpload } from "@/lib/reference-extract";

const MAX_FILES = 200;
const MAX_FILE_BYTES = 50 * 1024 * 1024;

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

    const existingCount = await prisma.referencePaper.count({ where: { projectId: id } });
    if (existingCount >= MAX_FILES) {
      return NextResponse.json(
        { error: `This project already has ${MAX_FILES} references (maximum). Remove one to add more.` },
        { status: 400 },
      );
    }

    const formData = await request.formData();
    const files = formData.getAll("files").filter((value): value is File => value instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ error: "No files uploaded." }, { status: 400 });
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Too many files. Max is ${MAX_FILES}.` }, { status: 400 });
    }

    const slotsLeft = MAX_FILES - existingCount;
    if (files.length > slotsLeft) {
      return NextResponse.json(
        { error: `You can add at most ${slotsLeft} more reference file(s) (max ${MAX_FILES} per project).` },
        { status: 400 },
      );
    }

    let created = 0;
    const errors: string[] = [];

    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        errors.push(`File too large (max 50MB): ${file.name}`);
        continue;
      }

      let extractedText = "";
      try {
        extractedText = await extractTextFromUpload(file);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : `Could not extract text from ${file.name}.`;
        errors.push(`${file.name}: ${message}`);
        continue;
      }

      try {
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
      } catch (error) {
        const message = error instanceof Error ? error.message : "Database save failed.";
        errors.push(`${file.name}: ${message}`);
      }
    }

    if (created === 0 && errors.length > 0) {
      return NextResponse.json({ error: errors[0], errors, created: 0 }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      created,
      errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload endpoint failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
