import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";
import { buildOutlinePrompt } from "@/lib/outline-prompt";
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

const OUTLINE_MAX_OUTPUT_TOKENS = 950;
const MAX_REFERENCE_SNIPPET_CHARS = 24_000;

function buildReferenceSnippets(papers: { originalName: string; extractedText: string }[]) {
  const chunks: string[] = [];
  let total = 0;

  for (const paper of papers) {
    const header = `\n\n### Reference: ${paper.originalName}\n`;
    const remaining = MAX_REFERENCE_SNIPPET_CHARS - total - header.length;
    if (remaining <= 200) break;

    const snippet = paper.extractedText.slice(0, Math.min(6000, remaining));
    const piece = `${header}${snippet}`;
    chunks.push(piece);
    total += piece.length;
  }

  return chunks.join("\n");
}

function fallbackOutline(prompt: string) {
  return {
    summary: "Starter outline generated without LLM access. Refine sections after you add more references.",
    suggested_sections: [
      {
        title: "Introduction",
        purpose: "Frame the research question and contribution.",
        key_points_from_references: ["Anchor claims to your uploaded sources where possible."],
        student_writing_tasks: ["Write problem statement", "Define scope and definitions"],
      },
      {
        title: "Literature review",
        purpose: "Synthesize prior work relevant to your question.",
        key_points_from_references: ["Cluster themes found across your reference PDFs."],
        student_writing_tasks: ["Summarize 3-5 themes", "Identify gaps your thesis addresses"],
      },
      {
        title: "Methodology",
        purpose: "Explain design, data, and validity.",
        key_points_from_references: ["Align methods with evidence types in your references."],
        student_writing_tasks: ["Justify method choice", "Address limitations"],
      },
      {
        title: "Results / Analysis",
        purpose: "Present findings with transparent reasoning.",
        key_points_from_references: ["Map each major claim to supporting sources."],
        student_writing_tasks: ["Report results", "Interpret cautiously"],
      },
      {
        title: "Discussion & conclusion",
        purpose: "Interpret implications and restate contribution.",
        key_points_from_references: ["Connect back to literature gaps."],
        student_writing_tasks: ["Discuss implications", "Close with limitations + future work"],
      },
    ],
    citation_notes: [
      "Replace placeholder claims with precise citations from your uploaded references.",
      "Prefer paraphrasing + citation over long quotes.",
    ],
    integrity_notice: integrityNotice,
    user_prompt_echo: prompt.slice(0, 400),
  };
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

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid prompt." }, { status: 400 });
  }

  const maxChars = getInputCharLimit();
  const maxWords = getInputWordLimit();
  const wordCount = countWords(parsed.data.prompt);
  if (wordCount > maxWords) {
    return NextResponse.json(
      { error: `Prompt is too long. Limit is ${maxWords.toLocaleString()} words.` },
      { status: 400 },
    );
  }
  if (parsed.data.prompt.length > maxChars) {
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

  const referenceSnippets = buildReferenceSnippets(papers);
  const promptText = buildOutlinePrompt({
    project: {
      title: project.title,
      field: project.field,
      degreeLevel: project.degreeLevel,
      language: project.language,
      researchQuestion: project.researchQuestion,
      description: project.description,
    },
    userPrompt: parsed.data.prompt,
    referenceSnippets,
    integrityNotice,
  });

  let outline: Record<string, unknown>;
  try {
    const response = await openai.responses.create({
      model: getModel(),
      input: promptText,
      max_output_tokens: OUTLINE_MAX_OUTPUT_TOKENS,
    });
    outline = JSON.parse(response.output_text);
  } catch {
    try {
      const fallback = await openai.responses.create({
        model: getFallbackModel(),
        input: promptText,
        max_output_tokens: OUTLINE_MAX_OUTPUT_TOKENS,
      });
      outline = JSON.parse(fallback.output_text);
    } catch {
      outline = fallbackOutline(parsed.data.prompt);
    }
  }

  outline.integrity_notice = integrityNotice;

  await prisma.$transaction(async (tx) => {
    await tx.documentSection.deleteMany({
      where: { projectId: id, sectionType: "live_draft" },
    });
    await tx.documentSection.deleteMany({
      where: { projectId: id, sectionType: { in: ["outline_suggested", "outline_summary"] } },
    });

    await tx.documentSection.create({
      data: {
        projectId: id,
        title: "Outline summary",
        sectionType: "outline_summary",
        content: JSON.stringify(
          {
            summary: outline.summary,
            citation_notes: outline.citation_notes,
            integrity_notice: outline.integrity_notice,
          },
          null,
          2,
        ),
      },
    });

    const sections = Array.isArray(outline.suggested_sections) ? outline.suggested_sections : [];
    for (const rawSection of sections) {
      const section = rawSection as Record<string, unknown>;
      const title = String(section.title || "Untitled section");
      const payload = JSON.stringify(section, null, 2);

      await tx.documentSection.create({
        data: {
          projectId: id,
          title,
          sectionType: "outline_suggested",
          content: payload,
        },
      });
    }
  });

  const sectionsCreated =
    (Array.isArray(outline.suggested_sections) ? outline.suggested_sections.length : 0) + 1;

  await incrementUsage(session.user.id);

  return NextResponse.json({ success: true, sectionsCreated, outline });
}
