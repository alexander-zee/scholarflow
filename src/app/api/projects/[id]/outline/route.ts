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
  prompt: z.string().min(8),
});

const OUTLINE_MAX_OUTPUT_TOKENS = 950;
const MAX_REFERENCE_SNIPPET_CHARS = 24_000;

type NestedSubsection = { title: string; focus?: string; subsubsections?: string[] };
type NestedSection = { title: string; purpose?: string; subsections?: NestedSubsection[] };

function parseTargetPagesFromPrompt(prompt: string) {
  const match = prompt.match(/Pages\s*\(UI setting\)\s*:\s*(\d{1,3})/i);
  if (!match) return 40;
  const value = Number.parseInt(match[1], 10);
  if (!Number.isFinite(value)) return 40;
  return Math.min(120, Math.max(10, value));
}

function estimateWordBudgetFromPages(targetPages: number) {
  // Academic drafts often land around 280-340 words/page depending on formatting.
  return Math.round(targetPages * 310);
}

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

function fallbackHierarchyForTitle(title: string): NestedSection[] {
  const base = (title || "Chapter").trim();
  return [
    {
      title: `${base}: conceptual framing`,
      purpose: "Define scope and core concepts.",
      subsections: [
        { title: "Background and motivation", focus: "Establish importance and context.", subsubsections: [] },
        { title: "Problem framing", focus: "Specify analytical scope and boundaries.", subsubsections: [] },
      ],
    },
    {
      title: `${base}: analysis and implications`,
      purpose: "Develop evidence and interpretation.",
      subsections: [
        { title: "Argument and evidence", focus: "Link claims with support and caveats.", subsubsections: [] },
        { title: "Implications and transition", focus: "Conclude chapter and bridge forward.", subsubsections: [] },
      ],
    },
  ];
}

function normalizeNestedSections(input: unknown, chapterTitle: string): NestedSection[] {
  if (!Array.isArray(input)) return fallbackHierarchyForTitle(chapterTitle);
  const normalized: NestedSection[] = [];
  for (const rawSection of input) {
    if (!rawSection || typeof rawSection !== "object") continue;
    const sec = rawSection as Record<string, unknown>;
    const title = String(sec.title || "").trim();
    if (!title) continue;
    const purpose = String(sec.purpose || "").trim();
    const subsections: NestedSubsection[] = [];
    if (Array.isArray(sec.subsections)) {
      for (const rawSub of sec.subsections) {
        if (!rawSub || typeof rawSub !== "object") continue;
        const sub = rawSub as Record<string, unknown>;
        const subTitle = String(sub.title || "").trim();
        if (!subTitle) continue;
        const focus = String(sub.focus || "").trim();
        const subsubsections = Array.isArray(sub.subsubsections)
          ? sub.subsubsections.map((v) => String(v || "").trim()).filter(Boolean)
          : [];
        subsections.push({ title: subTitle, focus: focus || undefined, subsubsections });
      }
    }
    normalized.push({
      title,
      purpose: purpose || undefined,
      subsections:
        subsections.length > 0
          ? subsections
          : [
              { title: "Core argument", focus: "Develop one claim with evidence.", subsubsections: [] },
              { title: "Interpretation", focus: "Interpret findings and transition.", subsubsections: [] },
            ],
    });
  }
  return normalized.length > 0 ? normalized : fallbackHierarchyForTitle(chapterTitle);
}

function fallbackOutline(prompt: string) {
  return {
    summary: "Starter outline generated without LLM access. Refine sections after you add more references.",
    suggested_sections: [
      {
        title: "Introduction",
        purpose: "Frame the research question and contribution.",
        sections: [
          {
            title: "Research background",
            purpose: "Establish context and motivation.",
            subsections: [
              { title: "Context and domain relevance", focus: "Explain why the topic matters now.", subsubsections: [] },
              { title: "Problem framing", focus: "Define the central problem and scope.", subsubsections: ["Boundaries of analysis"] },
            ],
          },
          {
            title: "Research objective and scope",
            purpose: "State question, objective, and thesis roadmap.",
            subsections: [
              { title: "Research question", focus: "Present the core question and expected contribution.", subsubsections: [] },
              { title: "Structure of the thesis", focus: "Preview chapter flow and logic.", subsubsections: [] },
            ],
          },
        ],
        key_points_from_references: ["Anchor claims to your uploaded sources where possible."],
        student_writing_tasks: ["Write problem statement", "Define scope and definitions"],
      },
      {
        title: "Literature review",
        purpose: "Synthesize prior work relevant to your question.",
        sections: [
          {
            title: "Theoretical foundations",
            purpose: "Define main theoretical lenses.",
            subsections: [
              { title: "Core concepts", focus: "Define concepts used later in analysis.", subsubsections: [] },
              { title: "Competing perspectives", focus: "Contrast major schools of thought.", subsubsections: [] },
            ],
          },
          {
            title: "Empirical evidence and research gap",
            purpose: "Summarize findings and identify unresolved issues.",
            subsections: [
              { title: "Key empirical findings", focus: "Synthesize major reported findings.", subsubsections: [] },
              { title: "Research gap", focus: "Show what remains unresolved and why this thesis matters.", subsubsections: [] },
            ],
          },
        ],
        key_points_from_references: ["Cluster themes found across your reference PDFs."],
        student_writing_tasks: ["Summarize 3-5 themes", "Identify gaps your thesis addresses"],
      },
      {
        title: "Methodology",
        purpose: "Explain design, data, and validity.",
        sections: [
          {
            title: "Research design and data",
            purpose: "Describe design choices and dataset.",
            subsections: [
              { title: "Research design", focus: "Justify design relative to research question.", subsubsections: [] },
              { title: "Data and sample", focus: "Describe sources, sampling, and preprocessing.", subsubsections: [] },
            ],
          },
          {
            title: "Modeling strategy and validity",
            purpose: "Specify methods and validation logic.",
            subsections: [
              { title: "Model specification", focus: "Define variables, equations, and assumptions.", subsubsections: ["Variable construction"] },
              { title: "Validity and limitations", focus: "Discuss internal/external validity and constraints.", subsubsections: [] },
            ],
          },
        ],
        key_points_from_references: ["Align methods with evidence types in your references."],
        student_writing_tasks: ["Justify method choice", "Address limitations"],
      },
      {
        title: "Results / Analysis",
        purpose: "Present findings with transparent reasoning.",
        sections: [
          {
            title: "Descriptive and main findings",
            purpose: "Report descriptive evidence and core results.",
            subsections: [
              { title: "Descriptive evidence", focus: "Present key patterns in data.", subsubsections: [] },
              { title: "Main results", focus: "Report primary model outcomes.", subsubsections: [] },
            ],
          },
          {
            title: "Robustness and interpretation",
            purpose: "Stress-test findings and interpret implications.",
            subsections: [
              { title: "Robustness checks", focus: "Show sensitivity analyses and alternative specs.", subsubsections: [] },
              { title: "Interpretation", focus: "Explain what findings imply and what they do not imply.", subsubsections: [] },
            ],
          },
        ],
        key_points_from_references: ["Map each major claim to supporting sources."],
        student_writing_tasks: ["Report results", "Interpret cautiously"],
      },
      {
        title: "Discussion & conclusion",
        purpose: "Interpret implications and restate contribution.",
        sections: [
          {
            title: "Discussion",
            purpose: "Connect findings to theory and practice.",
            subsections: [
              { title: "Theoretical implications", focus: "Explain implications for existing theory.", subsubsections: [] },
              { title: "Practical implications", focus: "Translate findings into actionable implications.", subsubsections: [] },
            ],
          },
          {
            title: "Limitations and conclusion",
            purpose: "Bound claims and conclude clearly.",
            subsections: [
              { title: "Limitations and future research", focus: "State limits and future directions.", subsubsections: [] },
              { title: "Conclusion", focus: "Restate contribution and final answer to question.", subsubsections: [] },
            ],
          },
        ],
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

  const promptWords = parsed.data.prompt.trim().split(/\s+/).filter(Boolean).length;
  if (papers.length === 0 && promptWords < 8) {
    return NextResponse.json({ error: "Provide a meaningful prompt (at least 8 words) or add sources first." }, { status: 400 });
  }
  console.log("[outline] validation", {
    projectId: id,
    promptWords,
    sourceCount: papers.length,
    pass: promptWords >= 8 || papers.length > 0,
  });

  const usageCheck = await ensureUsageAllowed(session.user.id);
  if (!usageCheck.allowed) {
    return NextResponse.json(
      { error: "Monthly AI review limit reached. Upgrade in pricing.", redirectTo: "/pricing" },
      { status: 402 },
    );
  }

  const referenceSnippets = buildReferenceSnippets(papers);
  const targetPages = parseTargetPagesFromPrompt(parsed.data.prompt);
  const targetWordBudget = estimateWordBudgetFromPages(targetPages);
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
    targetPages,
    targetWordBudget,
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
      section.sections = normalizeNestedSections(section.sections, title);
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
