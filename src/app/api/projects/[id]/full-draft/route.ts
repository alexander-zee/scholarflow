import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";
import { escapeLatex } from "@/lib/latex-escape";
import { integrityNotice } from "@/lib/review-modes";
import { ensureUsageAllowed, incrementUsage } from "@/lib/usage";
import {
  countWords,
  getFallbackModel,
  getInputCharLimit,
  getInputWordLimit,
  getModel,
} from "@/lib/ai-config";

const bodySchema = z.object({
  prompt: z.string().min(20),
});

const SECTION_MAX_OUTPUT_TOKENS = 1400;
const MAX_REFERENCE_SNIPPET_CHARS = 18000;

type OutlineSection = {
  title: string;
  purpose?: string;
  key_points_from_references?: string[];
  student_writing_tasks?: string[];
};

function parseOutlineSections(rawSections: { title: string; content: string }[]): OutlineSection[] {
  const parsed: OutlineSection[] = [];
  for (const section of rawSections) {
    try {
      const json = JSON.parse(section.content) as OutlineSection;
      if (json?.title) parsed.push(json);
    } catch {
      // ignore invalid json
    }
  }
  return parsed;
}

function buildReferenceSnippets(papers: { originalName: string; extractedText: string }[]) {
  const chunks: string[] = [];
  let total = 0;
  for (const paper of papers) {
    const header = `\n\n### ${paper.originalName}\n`;
    const remaining = MAX_REFERENCE_SNIPPET_CHARS - total - header.length;
    if (remaining <= 200) break;
    const snippet = paper.extractedText.slice(0, Math.min(4500, remaining));
    const piece = `${header}${snippet}`;
    chunks.push(piece);
    total += piece.length;
  }
  return chunks.join("\n");
}

function buildSectionPrompt(args: {
  project: {
    title: string;
    field: string;
    degreeLevel: string;
    language: string;
    researchQuestion: string;
    description?: string | null;
  };
  globalPrompt: string;
  section: OutlineSection;
  references: string;
}) {
  return `
You are ScholarFlow, an AI writing coach for academic thesis work.
Generate a substantial FIRST DRAFT for ONE section only.

Rules:
- Write in an academic tone.
- Do not claim fabricated facts as certain.
- When referencing ideas from provided sources, keep them as cautious claims and suggest verification.
- This is an editable draft, not submission-ready text.
- Prioritize academic rigor: clear claims, evidence linkage, methodological precision, and formal language.
- Avoid fluff, repetition, generic motivational wording, and conversational tone.
- Prefer paragraph-based scholarly prose (not bullet-heavy output).
- Include explicit transitions between paragraphs and connect arguments back to the research question.

Project:
- Title: ${args.project.title}
- Field: ${args.project.field}
- Level: ${args.project.degreeLevel}
- Language: ${args.project.language}
- Research question: ${args.project.researchQuestion}
- Description: ${args.project.description || ""}

User one-prompt instruction:
${args.globalPrompt}

Current section to draft:
- Title: ${args.section.title}
- Purpose: ${args.section.purpose || ""}
- Key points from references: ${(args.section.key_points_from_references || []).join("; ")}
- Student writing tasks: ${(args.section.student_writing_tasks || []).join("; ")}

Reference excerpts:
${args.references}

Output format:
Return **valid LaTeX** for the section body only (no \\documentclass preamble; the app wraps your output in an article).
Rules for LaTeX:
- Do NOT use \\section or \\part for the main section title (it is added automatically). You MAY use \\subsection{...} and \\subsubsection{...} inside the section.
- Do NOT use \\usepackage, \\RequirePackage, \\geometry, or \\hypersetup (the in-browser preview cannot load LaTeX packages).
- Use scholarly prose in \\paragraph{} blocks or plain paragraphs separated by blank lines.
- Use \\textbf{} sparingly for key terms; \\emph{} for stress.
- For math, use \\( ... \\) or \\[ ... \\] as appropriate.
- Citation placeholders: \\texttt{[Ref: source-topic]} where evidence is expected.
- Escape special characters in ordinary text (use \\% \\$ \\# etc. when needed).
- End with this exact integrity reminder (escape any LaTeX specials; you may wrap it in \\textit{...}):
${integrityNotice}
`.trim();
}

function fallbackSectionDraft(section: OutlineSection) {
  const purpose = escapeLatex(
    section.purpose || "Clarify the goal of this section in relation to the research question.",
  );
  return `This draft section is a starting point and should be expanded with project-specific evidence, citations, and argumentation. Use it to structure your own writing rather than as a final submission.

\\textbf{Purpose:} ${purpose}

\\subsection*{Suggested development path}
\\begin{itemize}
  \\item Introduce the section objective and its relevance.
  \\item Build two or three key analytical paragraphs with evidence.
  \\item Add explicit links to your uploaded references.
  \\item Close with a transition to the next section.
\\end{itemize}

\\texttt{[Ref: verify and replace with exact source]}

\\textit{${escapeLatex(integrityNotice)}}`;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.userId !== session.user.id) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const payload = bodySchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ error: "Invalid prompt." }, { status: 400 });
  }

  const maxChars = getInputCharLimit();
  const maxWords = getInputWordLimit();
  const wordCount = countWords(payload.data.prompt);
  if (wordCount > maxWords) {
    return NextResponse.json(
      { error: `Prompt is too long. Limit is ${maxWords.toLocaleString()} words.` },
      { status: 400 },
    );
  }
  if (payload.data.prompt.length > maxChars) {
    return NextResponse.json(
      { error: `Prompt is too long. Limit is ${maxChars.toLocaleString()} characters.` },
      { status: 400 },
    );
  }

  const papers = await prisma.referencePaper.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
  });
  if (papers.length === 0) {
    return NextResponse.json({ error: "Upload at least one reference paper first." }, { status: 400 });
  }

  const usageCheck = await ensureUsageAllowed(session.user.id);
  if (!usageCheck.allowed) {
    return NextResponse.json(
      { error: "Monthly AI review limit reached. Upgrade in pricing.", redirectTo: "/pricing" },
      { status: 402 },
    );
  }

  const outlineRows = await prisma.documentSection.findMany({
    where: { projectId: id, sectionType: "outline_suggested" },
    orderBy: { updatedAt: "asc" },
    select: { title: true, content: true },
  });

  const outlineSections = parseOutlineSections(outlineRows);
  if (outlineSections.length === 0) {
    return NextResponse.json(
      { error: "Generate an outline first before creating full draft chapters." },
      { status: 400 },
    );
  }

  const referenceSnippets = buildReferenceSnippets(papers);
  const drafts: { title: string; content: string }[] = [];

  for (const section of outlineSections) {
    const prompt = buildSectionPrompt({
      project: {
        title: project.title,
        field: project.field,
        degreeLevel: project.degreeLevel,
        language: project.language,
        researchQuestion: project.researchQuestion,
        description: project.description,
      },
      globalPrompt: payload.data.prompt,
      section,
      references: referenceSnippets,
    });

    let text = "";
    try {
      const response = await openai.responses.create({
        model: getModel(),
        input: prompt,
        max_output_tokens: SECTION_MAX_OUTPUT_TOKENS,
      });
      text = response.output_text?.trim();
    } catch {
      try {
        const fallback = await openai.responses.create({
          model: getFallbackModel(),
          input: prompt,
          max_output_tokens: SECTION_MAX_OUTPUT_TOKENS,
        });
        text = fallback.output_text?.trim();
      } catch {
        text = fallbackSectionDraft(section);
      }
    }

    drafts.push({
      title: section.title,
      content: text || fallbackSectionDraft(section),
    });
  }

  await prisma.$transaction(async (tx) => {
    // Drop autosaved studio buffer so GET live-draft serves the new combined draft, not a cached outline / old text.
    await tx.documentSection.deleteMany({
      where: { projectId: id, sectionType: "live_draft" },
    });
    await tx.documentSection.deleteMany({
      where: { projectId: id, sectionType: "draft_chapter" },
    });

    for (const draft of drafts) {
      await tx.documentSection.create({
        data: {
          projectId: id,
          title: draft.title,
          sectionType: "draft_chapter",
          content: draft.content,
        },
      });
    }
  });

  await incrementUsage(session.user.id);

  return NextResponse.json({
    success: true,
    sectionsCreated: drafts.length,
    message: "Full first draft chapters generated.",
  });
}
