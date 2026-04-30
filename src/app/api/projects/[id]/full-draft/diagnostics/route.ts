import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type StoredDiagnostics = {
  jobId?: string;
  failedStep?: string | null;
  sectionCountsByChapter?: number[];
  subsectionCountsByChapter?: number[];
  equationCountsByChapter?: number[];
  tableCountsByChapter?: number[];
  figureCountsByChapter?: number[];
  first1000CharsByChapter?: string[];
  totalSectionCountAcrossChapters?: number;
  totalSubsectionCountAcrossChapters?: number;
  combinedDocumentCharLength?: number;
  combinedDocumentPreview2000?: string;
  abstractPreview800?: string;
  chapters?: unknown[];
};

/**
 * GET diagnostics from a FullDraftJob's persisted `details` JSON.
 * Query: `jobId` — optional; defaults to latest **failed** job for this project.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: projectId } = await context.params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.userId !== session.user.id) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    projectId,
    message:
      "Full-draft diagnostics endpoint is temporarily unavailable on this deployment target. Use the job poll response details from /full-draft?jobId=... instead.",
    job: null,
    qualityFailureReport: null as unknown[] | null,
    draftDiagnostics: null as StoredDiagnostics | null,
  });
}
