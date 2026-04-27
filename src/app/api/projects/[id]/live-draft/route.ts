import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  buildLatexOutlinePlaceholder,
  buildLatexPaperFromChapters,
  buildMarkdownPaperFromChapters,
  chaptersLookLikeMarkdown,
  inferDraftFormatFromContent,
} from "@/lib/draft-latex";
import { escapeLatex } from "@/lib/latex-escape";

const LIVE_DRAFT_TYPE = "live_draft";
const LIVE_DRAFT_TITLE = "Live Draft";
const MIN_SUBSTANTIAL_LIVE_DRAFT_CHARS = 120;

const GENERATED_DRAFT_NOTE =
  "Below is your AI-generated first draft, combined into one document. Edit freely; your changes autosave here.";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const project = await prisma.project.findUnique({
    where: { id },
    select: { userId: true, title: true },
  });
  if (!project || project.userId !== session.user.id) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const draft = await prisma.documentSection.findFirst({
    where: { projectId: id, sectionType: LIVE_DRAFT_TYPE },
    orderBy: { updatedAt: "desc" },
    select: { id: true, content: true, updatedAt: true },
  });

  const savedLive = (draft?.content ?? "").trim();
  if (savedLive.length >= MIN_SUBSTANTIAL_LIVE_DRAFT_CHARS) {
    return NextResponse.json({
      draft: draft!.content,
      sectionId: draft!.id,
      updatedAt: draft!.updatedAt.toISOString(),
      source: "live_draft" as const,
      draftFormat: inferDraftFormatFromContent(draft!.content),
    });
  }

  const draftChapters = await prisma.documentSection.findMany({
    where: { projectId: id, sectionType: "draft_chapter" },
    orderBy: { createdAt: "asc" },
    select: { title: true, content: true },
  });

  if (draftChapters.length > 0) {
    const useMd = chaptersLookLikeMarkdown(draftChapters);
    const combined = useMd
      ? buildMarkdownPaperFromChapters(
          draftChapters,
          `# ${project.title}\n\n*${GENERATED_DRAFT_NOTE}*`,
        )
      : buildLatexPaperFromChapters(project.title, draftChapters, GENERATED_DRAFT_NOTE);
    return NextResponse.json({
      draft: combined,
      sectionId: draft?.id ?? null,
      updatedAt: draft?.updatedAt?.toISOString() ?? null,
      source: "generated_draft" as const,
      draftFormat: useMd ? ("markdown" as const) : ("latex" as const),
    });
  }

  if (savedLive.length > 0) {
    return NextResponse.json({
      draft: draft!.content,
      sectionId: draft!.id,
      updatedAt: draft!.updatedAt.toISOString(),
      source: "live_draft" as const,
      draftFormat: inferDraftFormatFromContent(draft!.content),
    });
  }

  const outlineRows = await prisma.documentSection.findMany({
    where: { projectId: id, sectionType: "outline_suggested" },
    orderBy: { createdAt: "asc" },
    select: { title: true, content: true },
  });

  if (outlineRows.length > 0) {
    const outlineLatexBlocks = outlineRows
      .map((row) => {
        let body = row.content.trim();
        try {
          const parsed = JSON.parse(row.content) as { title?: string; purpose?: string };
          if (parsed?.title) {
            body = [parsed.title, parsed.purpose].filter(Boolean).join("\n\n");
          }
        } catch {
          // keep raw content
        }
        const title = (row.title || "Section").trim();
        return `\\section*{${escapeLatex(title)}}\n\\begin{quote}\\small ${escapeLatex(body)}\\end{quote}`;
      })
      .join("\n\n");

    const combined = buildLatexOutlinePlaceholder(project.title, outlineLatexBlocks);

    return NextResponse.json({
      draft: combined,
      sectionId: draft?.id ?? null,
      updatedAt: draft?.updatedAt?.toISOString() ?? null,
      source: "outline_only" as const,
      draftFormat: "latex" as const,
    });
  }

  return NextResponse.json({
    draft: "",
    sectionId: draft?.id ?? null,
    updatedAt: draft?.updatedAt?.toISOString() ?? null,
    source: "empty" as const,
    draftFormat: "latex" as const,
  });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const project = await prisma.project.findUnique({ where: { id }, select: { userId: true } });
  if (!project || project.userId !== session.user.id) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const payload = (await request.json()) as { content?: unknown };
  const content = typeof payload.content === "string" ? payload.content : "";

  const existing = await prisma.documentSection.findFirst({
    where: { projectId: id, sectionType: LIVE_DRAFT_TYPE },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  const saved = existing
    ? await prisma.documentSection.update({
        where: { id: existing.id },
        data: { content },
        select: { id: true, updatedAt: true },
      })
    : await prisma.documentSection.create({
        data: {
          projectId: id,
          title: LIVE_DRAFT_TITLE,
          sectionType: LIVE_DRAFT_TYPE,
          content,
        },
        select: { id: true, updatedAt: true },
      });

  return NextResponse.json({ success: true, sectionId: saved.id, updatedAt: saved.updatedAt.toISOString() });
}
