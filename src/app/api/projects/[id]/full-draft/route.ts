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
import { sanitizeThesisLatexMath } from "@/lib/latex-math-sanitize";
import {
  chapterKindGuidance,
  inferThesisChapterKind,
  projectUsesEarlyChapterMathDelay,
  projectWantsEconometricsDepth,
  THESIS_CITATION_RULES,
  THESIS_ECONOMETRICS_DEPTH,
  THESIS_FILLER_BAN,
  THESIS_FIGURE_HQ_RULES,
  THESIS_FIGURE_PLACEHOLDER_RULES,
  THESIS_INTRODUCTION_HQ_SECTIONS,
  THESIS_MATH_RULES,
  THESIS_MATH_RULES_EARLY_CHAPTERS,
  THESIS_MATH_RULES_EARLY_CHAPTERS_HQ,
  THESIS_RESULTS_TABLE_GUIDE_HQ,
  type ThesisChapterKind,
} from "@/lib/thesis-prompt-standards";
import {
  appendFigurePlaceholdersForChapter,
  ensureGlobalFigureMinimum,
  stripDisplayedMathFromBody,
} from "@/lib/thesis-latex-postprocess";
import {
  auditAbstractLatex,
  auditChapterBody,
  auditHighQualityFinalGate,
  buildQualityRepairPrompt,
} from "@/lib/thesis-quality-audit";
import {
  detectHighQualityThesisMode,
  HQ_ABSTRACT_TOKENS,
  HQ_BLUEPRINT_TOKENS,
  HQ_DEDUPE_TOKENS,
  HQ_MAX_QUALITY_ROUNDS,
  HQ_QUALITY_REPAIR_TOKENS,
  HQ_SECTION_DEEP_TOKENS,
  HQ_SECTION_MAX_TOKENS,
  HQ_SKELETON_TOKENS,
} from "@/lib/thesis-high-quality";
import { validateThesisUserInputs } from "@/lib/thesis-input-validation";
import {
  auditCombinedThesisBodies,
  auditTextForPlaceholderLeaks,
  buildAntiPlaceholderAbstractPrompt,
  buildAntiPlaceholderChapterPrompt,
} from "@/lib/thesis-placeholder-audit";
import { injectHighQualityFiguresAndTables } from "@/lib/thesis-figures-tables";

const bodySchema = z.object({
  prompt: z.string().min(8),
  highQualityThesis: z.boolean().optional(),
});

const SECTION_MAX_OUTPUT_TOKENS = 3000;
const SECTION_MAX_OUTPUT_TOKENS_DEEP = 4200;
const ABSTRACT_MAX_OUTPUT_TOKENS = 900;
const SKELETON_MAX_OUTPUT_TOKENS = 900;
const QUALITY_REPAIR_MAX_TOKENS = 2800;
const MAX_REFERENCE_SNIPPET_CHARS = 18000;
const MAX_SECTION_EXPANSION_PASSES = 2;
const MAX_STRUCTURE_REPAIR_PASSES = 2;
const MAX_ABSTRACT_EXPANSION_PASSES = 2;
const MAX_QUALITY_REPAIR_PASSES = 2;

function countPromptWords(input: string) {
  return input.trim().split(/\s+/).filter(Boolean).length;
}

function looksPlaceholderTitle(input: string) {
  return /^(thesis\s*title|title|untitled|new project|placeholder)$/i.test(input.trim());
}

function toTitleCase(input: string) {
  return input
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
    .slice(0, 120);
}

function inferProjectTitleFromPrompt(prompt: string): string {
  const p = prompt.trim().replace(/[.?!]+$/, "");
  if (!p) return "Academic Research Thesis";
  if (/^machine learning in the /i.test(p)) {
    const topic = p.replace(/^machine learning in the /i, "").trim();
    return `Machine Learning Applications in the ${toTitleCase(topic)}`.slice(0, 120);
  }
  return toTitleCase(p);
}

function hasUploadedDatasetFilenames(names: string[]) {
  return names.some((n) => /\.(csv|xlsx|xls|json|parquet|tsv)\b/i.test(n));
}

function hasCanonicalFiveChapterCoverage(outline: OutlineSection[]) {
  const kinds = new Set(outline.map((o) => inferThesisChapterKind(o.title)));
  return ["introduction", "literature", "methodology", "results", "discussion"].every((k) => kinds.has(k as ThesisChapterKind));
}

function canonicalFiveChapterOutline(): OutlineSection[] {
  return [
    { title: "Chapter 1 Introduction", purpose: "Frame background, problem, objective, contribution, limits, and thesis structure." },
    { title: "Chapter 2 Literature Review", purpose: "Synthesize relevant literature, identify gaps, and define positioning." },
    { title: "Chapter 3 Methodology", purpose: "Present data strategy, model design, and empirical/analytical approach." },
    { title: "Chapter 4 Results and Analysis", purpose: "Present analysis outputs and interpretation without unsupported claims." },
    { title: "Chapter 5 Discussion and Conclusion", purpose: "Conclude contributions, limitations, and future research directions." },
  ];
}

type OutlineSubsection = {
  title: string;
  focus?: string;
  subsubsections?: string[];
};

type OutlineSectionNode = {
  title: string;
  purpose?: string;
  subsections?: OutlineSubsection[];
};

type OutlineSection = {
  title: string;
  purpose?: string;
  sections?: OutlineSectionNode[];
  key_points_from_references?: string[];
  student_writing_tasks?: string[];
  target_words?: number;
};

function parseTargetPagesFromPrompt(prompt: string) {
  const match = prompt.match(/Pages\s*\(UI setting\)\s*:\s*(\d{1,3})/i);
  if (!match) return 40;
  const value = Number.parseInt(match[1], 10);
  if (!Number.isFinite(value)) return 40;
  return Math.min(120, Math.max(10, value));
}

function estimateWordBudgetFromPages(targetPages: number) {
  return Math.round(targetPages * 310);
}

function allocateSectionWordTargets(outlineSections: OutlineSection[], totalTargetWords: number) {
  if (outlineSections.length === 0) return [];

  const explicitTargetTotal = outlineSections.reduce(
    (sum, section) => sum + (typeof section.target_words === "number" ? section.target_words : 0),
    0,
  );
  const fallbackPerSection = Math.max(700, Math.round(totalTargetWords / outlineSections.length));

  if (explicitTargetTotal <= 0) {
    return outlineSections.map((section) => ({
      ...section,
      target_words: fallbackPerSection,
    }));
  }

  return outlineSections.map((section) => {
    const base = typeof section.target_words === "number" ? section.target_words : fallbackPerSection;
    const scaled = Math.round((base / explicitTargetTotal) * totalTargetWords);
    return {
      ...section,
      target_words: Math.max(650, scaled),
    };
  });
}

function countApproxWords(input: string) {
  return input
    .replace(/\\[a-zA-Z]+\{[^}]*\}/g, " ")
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/[{}[\]\\]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function normalizeSubsection(raw: unknown): OutlineSubsection | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const title = String(item.title || "").trim();
  if (!title) return null;
  const subsubsections = Array.isArray(item.subsubsections)
    ? item.subsubsections.map((v) => String(v || "").trim()).filter(Boolean)
    : [];
  const focus = String(item.focus || "").trim();
  return { title, focus: focus || undefined, subsubsections };
}

function normalizeSectionNode(raw: unknown): OutlineSectionNode | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const title = String(item.title || "").trim();
  if (!title) return null;
  const purpose = String(item.purpose || "").trim();
  const subsections = Array.isArray(item.subsections)
    ? item.subsections.map(normalizeSubsection).filter((v): v is OutlineSubsection => Boolean(v))
    : [];
  return { title, purpose: purpose || undefined, subsections };
}

function buildFallbackHierarchy(section: OutlineSection): OutlineSectionNode[] {
  const base = section.title.trim() || "Chapter";
  return [
    {
      title: `${base} framing`,
      purpose: "Establish scope, definitions, and chapter logic.",
      subsections: [
        { title: "Context and motivation", focus: "Define why the chapter topic matters.", subsubsections: [] },
        { title: "Core concepts", focus: "Define key constructs before analysis.", subsubsections: [] },
      ],
    },
    {
      title: `${base} analysis`,
      purpose: "Develop argument, evidence, and interpretation.",
      subsections: [
        {
          title: "Main argument and evidence",
          focus: "Develop claim-evidence linkage with citation placeholders.",
          subsubsections: ["Interpretation and implications"],
        },
        { title: "Limitations and transition", focus: "State constraints and bridge to next chapter.", subsubsections: [] },
      ],
    },
  ];
}

function parseOutlineSections(rawSections: { title: string; content: string }[]): OutlineSection[] {
  const parsed: OutlineSection[] = [];
  for (const section of rawSections) {
    try {
      const json = JSON.parse(section.content) as OutlineSection;
      if (json?.title) {
        const normalizedSections = Array.isArray(json.sections)
          ? json.sections.map(normalizeSectionNode).filter((v): v is OutlineSectionNode => Boolean(v))
          : [];
        parsed.push({
          ...json,
          title: String(json.title).trim(),
          purpose: json.purpose ? String(json.purpose).trim() : undefined,
          sections: normalizedSections.length > 0 ? normalizedSections : buildFallbackHierarchy(json),
        });
      }
    } catch {
      // ignore invalid json
    }
  }
  return parsed;
}

function countMatches(input: string, re: RegExp) {
  return (input.match(re) || []).length;
}

function draftHasDenseHierarchy(body: string) {
  const sectionCount = countMatches(body, /\\section\*?\{[^}]+\}/g);
  const subsectionCount = countMatches(body, /\\subsection\*?\{[^}]+\}/g);
  const subsubsectionCount = countMatches(body, /\\subsubsection\*?\{[^}]+\}/g);
  const hasFlatWall = sectionCount === 0 && body.replace(/\s+/g, " ").trim().length > 2500;
  const isValid =
    sectionCount >= 3 &&
    subsectionCount >= Math.max(3, sectionCount * 2 - 2) &&
    !hasFlatWall;
  return { isValid, sectionCount, subsectionCount, subsubsectionCount };
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

async function openAiThesisText(prompt: string, maxOutputTokens: number): Promise<string> {
  try {
    const response = await openai.responses.create({
      model: getModel(),
      input: prompt,
      max_output_tokens: maxOutputTokens,
    });
    return response.output_text?.trim() || "";
  } catch {
    try {
      const response = await openai.responses.create({
        model: getFallbackModel(),
        input: prompt,
        max_output_tokens: maxOutputTokens,
      });
      return response.output_text?.trim() || "";
    } catch {
      return "";
    }
  }
}

function buildAbstractPrompt(args: {
  project: {
    title: string;
    field: string;
    degreeLevel: string;
    language: string;
    researchQuestion: string;
    description?: string | null;
  };
  globalPrompt: string;
  references: string;
  technicalPipeline: boolean;
}) {
  const abstractMathPolicy = args.technicalPipeline
    ? "Abstract math policy (technical thesis): narrative prose only. No \\[ ... \\], no equation/align/gather/multline environments, no optimization problems, loss functions, or formal probability statements as equations. Light \\( ... \\) symbols only if indispensable (single symbols)."
    : THESIS_MATH_RULES;

  return `
You are ThesisPilot. Write ONE complete thesis Abstract as LaTeX body content ONLY (no preamble, no \\chapter, no \\begin{abstract} wrapper).

Length: 150–250 words of substantive academic prose (count words in the rendered thesis, not LaTeX commands).

The abstract MUST explicitly cover ALL of:
1) research objective and motivation
2) research question(s)
3) data / sample / empirical setting (or intended data if not yet collected — state honestly)
4) methodology / econometric or theoretical approach
5) key expected or empirical findings (hypothesized or preliminary — do not fabricate precise estimates)
6) contribution to literature or practice

Forbidden:
- Placeholder-only abstracts (e.g. a line that is only "Research question" or empty headings)
- Bullet lists as a substitute for prose
- Claiming results that contradict "no data yet" if the user prompt implies early-stage work

Project:
- Title: ${args.project.title}
- Field: ${args.project.field}
- Level: ${args.project.degreeLevel}
- Language: ${args.project.language}
- Research question: ${args.project.researchQuestion}
- Description: ${args.project.description || ""}

User instruction summary:
${args.globalPrompt}

Reference excerpts (may be partial):
${args.references}

${THESIS_CITATION_RULES}
- Prefer numbered citation placeholders [1], [2], [3] in prose when source metadata exists.
${abstractMathPolicy}
Output valid LaTeX paragraphs (\\textbf{} / \\emph{} allowed). No \\chapter.
`.trim();
}

function buildAbstractExpansionPrompt(args: { existing: string; targetMinWords: number; references: string }) {
  return `
Expand and deepen the thesis Abstract below. Keep it valid LaTeX body only. Target at least ${args.targetMinWords} words of academic prose while staying under 280 words.

Preserve all true claims; add concrete detail on data, methods, expected findings, and contribution. Do not add fabricated numeric results.

Existing abstract:
${args.existing}

Reference excerpts:
${args.references}
`.trim();
}

function buildSkeletonPrompt(args: {
  project: {
    title: string;
    field: string;
    degreeLevel: string;
    language: string;
    researchQuestion: string;
  };
  section: OutlineSection;
  references: string;
  thesisBlueprint?: string;
  highQualityThesis?: boolean;
  chapterKind: ThesisChapterKind;
}) {
  const hierarchy = (args.section.sections && args.section.sections.length > 0 ? args.section.sections : buildFallbackHierarchy(args.section))
    .map((sec, i) => {
      const subs = (sec.subsections || [])
        .map((sub, j) => {
          const subsubs = (sub.subsubsections || []).map((leaf) => `      - ${leaf}`).join("\n");
          return [`    - ${i + 1}.${j + 1} ${sub.title}`, sub.focus ? `      focus: ${sub.focus}` : "", subsubs]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n");
      return [`- ${i + 1}. ${sec.title}`, sec.purpose ? `  purpose: ${sec.purpose}` : "", subs].filter(Boolean).join("\n");
    })
    .join("\n");

  const hqIntro =
    args.highQualityThesis && args.chapterKind === "introduction"
      ? `\n${THESIS_INTRODUCTION_HQ_SECTIONS}\n`
      : "";
  const blueprintBlock = args.thesisBlueprint?.trim()
    ? `\nCross-chapter thesis blueprint (stay consistent with this narrative arc):\n${args.thesisBlueprint.trim().slice(0, 12000)}\n`
    : "";

  return `
You are ThesisPilot. Produce a LaTeX OUTLINE SKELETON for ONE thesis chapter (Pass 3 — structure only; no duplicated section themes).

Rules:
- Output LaTeX ONLY for the interior of the chapter (no \\chapter, no preamble).
- Use ONLY: \\section{...}, \\subsection{...}, \\subsubsection{...}.
- Immediately after each heading, add ONE short line in \\textit{...} describing what that block will argue (intent only — not full prose).
- Do not repeat the same \\section theme twice (e.g. only one roadmap / structure section).
- Mirror this blueprint as closely as possible (you may add \\subsubsection where technical detail is needed):
${hierarchy}
${hqIntro}
${blueprintBlock}

Project context:
- Title: ${args.project.title}
- Field: ${args.project.field}
- Level: ${args.project.degreeLevel}
- Language: ${args.project.language}
- Research question: ${args.project.researchQuestion}

Reference excerpts (for topical alignment only):
${args.references.slice(0, 8000)}
`.trim();
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
  targetWords: number;
  targetPages: number;
  chapterKind: ThesisChapterKind;
  skeleton: string;
  chapterOrderIndex: number;
  technicalPipeline: boolean;
  thesisBlueprint?: string;
  highQualityThesis?: boolean;
  hasDataset?: boolean;
}) {
  const hierarchy = (args.section.sections && args.section.sections.length > 0 ? args.section.sections : buildFallbackHierarchy(args.section))
    .map((sec, i) => {
      const subs = (sec.subsections || [])
        .map((sub, j) => {
          const subsubs = (sub.subsubsections || []).map((leaf) => `      - ${leaf}`).join("\n");
          return [`    - ${i + 1}.${j + 1} ${sub.title}`, sub.focus ? `      focus: ${sub.focus}` : "", subsubs]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n");
      return [`- ${i + 1}. ${sec.title}`, sec.purpose ? `  purpose: ${sec.purpose}` : "", subs].filter(Boolean).join("\n");
    })
    .join("\n");

  const earlyTechnical = args.technicalPipeline && args.chapterOrderIndex < 2;
  const econBlock =
    projectWantsEconometricsDepth(args.project.field) && !earlyTechnical ? `\n${THESIS_ECONOMETRICS_DEPTH}\n` : "";
  const mathRulesBlock =
    earlyTechnical && args.highQualityThesis
      ? `\n${THESIS_MATH_RULES_EARLY_CHAPTERS_HQ}\n`
      : earlyTechnical
        ? `\n${THESIS_MATH_RULES_EARLY_CHAPTERS}\n`
        : `\n${THESIS_MATH_RULES}\n`;
  const figureRulesBlock = args.technicalPipeline
    ? args.highQualityThesis
      ? `\n${THESIS_FIGURE_HQ_RULES}\n`
      : `\n${THESIS_FIGURE_PLACEHOLDER_RULES}\n`
    : "";
  const chapterGuidanceBlock =
    args.highQualityThesis && args.chapterKind === "results"
      ? THESIS_RESULTS_TABLE_GUIDE_HQ
      : chapterKindGuidance(args.chapterKind);
  const hqIntroBlock =
    args.highQualityThesis && args.chapterKind === "introduction" ? `\n${THESIS_INTRODUCTION_HQ_SECTIONS}\n` : "";
  const blueprintBlock = args.thesisBlueprint?.trim()
    ? `\nThesis blueprint (stay aligned; do not contradict):\n${args.thesisBlueprint.trim().slice(0, 12000)}\n`
    : "";
  const flowBlock = args.highQualityThesis
    ? `
Section writing standard (high-quality):
- Each section: state purpose, deliver substantive content, link explicitly to the research question, then transition to the next section.
- In empirical Results subsections: what is estimated or shown; headline result; statistical interpretation; substantive interpretation; limitation or caution.
`.trim()
    : "";
  const noDatasetBlock = args.hasDataset
    ? ""
    : `
Dataset availability constraint:
- No structured dataset upload was detected.
- Do NOT invent empirical coefficients, sample sizes, p-values, benchmark scores, or "observed" results.
- Write as literature-grounded analysis with a proposed empirical strategy, expected analytical outcomes, and explicit limitations.
`.trim();
  const skeletonBlock = args.skeleton.trim()
    ? `\nMandatory skeleton — preserve every \\section, \\subsection, and \\subsubsection heading from the skeleton in order; replace each intent line (\\textit{...}) with full scholarly prose under that heading:\n${args.skeleton.trim()}\n`
    : "";

  return `
You are ThesisPilot, an AI writing coach for academic thesis work.
Generate a substantial FIRST DRAFT for ONE section only (Pass 4 — full prose).

Rules:
- Write in an academic tone.
- Do not claim fabricated facts as certain.
- When referencing ideas from provided sources, keep them as cautious claims and suggest verification.
- This is an editable draft, not submission-ready text.
- Prioritize academic rigor: clear claims, evidence linkage, methodological precision, and formal language.
- Avoid fluff, repetition, generic motivational wording, and conversational tone.
- Prefer paragraph-based scholarly prose (not bullet-heavy output).
- Include explicit transitions between paragraphs and connect arguments back to the research question.
- Prioritize concrete, information-dense writing over generic summaries.
- Include depth: conceptual framing, methodological rationale, critical comparisons, and implications where relevant.
- Aim for thesis-ready structure: where appropriate, open with scope and contribution of this section, then develop argument in nested \\subsection{} / \\subsubsection{} blocks (not a flat wall of text).
- Match conventions of ${args.project.degreeLevel} work in ${args.project.field}: define terms, state assumptions, distinguish results from interpretation, and note limitations.
- Use natbib-style citation keys for placeholders when evidence is needed, e.g. \\citep{AuthorYearTopic} or \\citet{AuthorYearTopic} (keys must be plausible but are placeholders until the student wires a real .bib file).
- Prefer formal signposting ("This section proceeds as follows…", "Building on the foregoing…") sparingly but clearly.
- Do not write long undivided chapter blocks. Each chapter must be split into sections, subsections, and where useful subsubsections. Use precise academic headings. Each heading should contain focused paragraphs that develop one argument at a time. The thesis should resemble a real university thesis, not a generic essay.
- Use LaTeX-style hierarchy:
  \\chapter{}
  \\section{}
  \\subsection{}
  \\subsubsection{}
  Do not skip directly from chapter to paragraphs unless it is a very short preface or abstract.
- Density requirement: prioritize specific arguments, definitions, methodological justification, and interpretation after results. Avoid filler and repeated points.
${econBlock}
Chapter-specific guidance:
${chapterGuidanceBlock}
${hqIntroBlock}
${blueprintBlock}
${flowBlock}
${noDatasetBlock}
${mathRulesBlock}
${THESIS_CITATION_RULES}
- Prefer numbered citation placeholders [1], [2], [3] in prose when source metadata exists.

${THESIS_FILLER_BAN}
${figureRulesBlock}
${skeletonBlock}

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
- Target words for this section: ${args.targetWords}
- Overall requested pages for document: ${args.targetPages}
- Required hierarchy blueprint for this chapter:
${hierarchy}

Reference excerpts:
${args.references}

Output format:
Return **valid LaTeX** for the section body only (no \\documentclass preamble; the app wraps your output in an article for preview, but exports compile as a thesis-style report with \\chapter{} per outline section).
Rules for LaTeX:
- Do NOT use \\chapter or \\part for the main section title (it is added automatically).
- You MUST include multiple \\section{...} blocks inside this chapter body.
- Each \\section should usually include 2-4 \\subsection{...} blocks.
- Add \\subsubsection{...} for technical detail where appropriate.
- Do NOT use \\usepackage, \\RequirePackage, \\geometry, or \\hypersetup (the in-browser preview cannot load LaTeX packages).
- Use scholarly prose in \\paragraph{} blocks or plain paragraphs separated by blank lines.
- Use \\textbf{} sparingly for key terms; \\emph{} for stress.
${
  earlyTechnical
    ? "- For math: light inline \\( ... \\) only if absolutely necessary; no \\[ ... \\] and no equation/align/gather display environments in this chapter."
    : "- For math, use \\( ... \\) or \\[ ... \\] as appropriate (from Methodology onward)."
}
- Prefer \\citep{KeyYear} / \\citet{KeyYear} (natbib) for citation placeholders; you may still use \\texttt{[Ref: source-topic]} where a source cannot be named.
- Escape special characters in ordinary text (use \\% \\$ \\# etc. when needed).
`.trim();
}

function buildExpansionPrompt(args: {
  section: OutlineSection;
  existingDraft: string;
  references: string;
  remainingWords: number;
}) {
  return `
Expand the thesis section below with NEW material only.

Section title: ${args.section.title}
Approximate additional words required: ${args.remainingWords}

Rules:
- Continue directly from the existing draft; do not restart or repeat prior paragraphs.
- Add concrete analysis, argument depth, and reference-anchored points.
- Keep academic tone and coherent flow.
- Return only valid LaTeX body content.
- Add material that reads like an expanded thesis chapter (signposting, definitions, and \\citep{}/\\citet{} placeholders where claims need sources).
- Preserve and deepen heading hierarchy; add missing \\section/\\subsection/\\subsubsection where needed instead of adding unstructured paragraphs.

Existing draft:
${args.existingDraft}

Reference excerpts:
${args.references}
`.trim();
}

function buildBlueprintPrompt(args: {
  project: {
    title: string;
    field: string;
    degreeLevel: string;
    researchQuestion: string;
    description?: string | null;
  };
  chapterTitles: string[];
  globalPrompt: string;
  references: string;
}) {
  return `
You are planning a long-form quantitative thesis (Pass 2 — thesis blueprint).

Output plain text only (no LaTeX). Write 600–1200 words as a structured blueprint with one subsection per planned chapter in order:
${args.chapterTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")}

For each chapter, specify: purpose, core claims, data/method hooks, and how it answers the research question. Flag identification, estimation, and robustness only where relevant (later chapters).

Project:
- Title: ${args.project.title}
- Field: ${args.project.field}
- Level: ${args.project.degreeLevel}
- Research question: ${args.project.researchQuestion}
- Description: ${args.project.description || ""}

User instruction summary:
${args.globalPrompt}

Reference excerpts (for topical alignment):
${args.references.slice(0, 14000)}
`.trim();
}

function buildIntroDedupePrompt(args: { existingDraft: string; references: string }) {
  return `
You are editing the Introduction chapter of a thesis in LaTeX (structural deduplication pass).

Enforce EXACTLY one coherent sequence of themes. Preferred \\section headings (use these titles once each, in this order, merging overlapping duplicate blocks):
\\section{Research Background}
\\section{Problem Statement}
\\section{Research Objective and Research Question}
\\section{Contribution}
\\section{Scope and Limitations}
\\section{Structure of the Thesis}

Rules:
- Remove duplicate \\section{...} blocks that repeat the same theme (e.g. two "Research Background" or two roadmap sections).
- Remove repeated filler that restates the thesis roadmap multiple times.
- Keep valid LaTeX body only (no preamble; no \\chapter).
- Preserve legitimate \\citep/\\citet placeholders.
- No displayed mathematics (no \\[, equation, align, gather).

Current Introduction LaTeX:
${args.existingDraft}

Reference excerpts:
${args.references.slice(0, 8000)}
`.trim();
}

function buildStructureRepairPrompt(args: { section: OutlineSection; existingDraft: string; references: string }) {
  return `
Revise the chapter draft below to enforce a proper thesis hierarchy and denser academic content.

Chapter title: ${args.section.title}

Requirements:
- Keep valid LaTeX body only (no preamble).
- Use multiple \\section{...} blocks.
- Each \\section should typically contain 2-4 \\subsection{...} blocks.
- Add \\subsubsection{...} where technical detail is important.
- Break long walls of text into focused headed blocks.
- Keep argumentation specific, evidence-oriented, and methodologically explicit.
- Keep and improve useful existing content; do not discard core ideas.

Existing draft:
${args.existingDraft}

Reference excerpts:
${args.references}
`.trim();
}

function buildFallbackAbstractLatex(project: {
  title: string;
  field: string;
  degreeLevel: string;
  researchQuestion: string;
  description?: string | null;
}): string {
  const rq = escapeLatex(project.researchQuestion.trim());
  const field = escapeLatex(project.field);
  const title = escapeLatex(project.title.trim());
  const desc = project.description?.trim() ? escapeLatex(project.description.trim()) : "";
  return [
    `This thesis, titled \\textbf{${title}}, is situated in ${field} at the ${escapeLatex(project.degreeLevel)} level.`,
    `The central research question is: ${rq}.`,
    desc ? `Additional context: ${desc}` : "",
    "The work synthesizes prior theory and empirical evidence, develops a transparent econometric or quantitative strategy aligned with the stated question, and discusses how data limitations affect interpretation.",
    "Methodologically, the thesis specifies estimators, identifying assumptions where relevant, and a plan for inference and robustness checks rather than asserting final estimates without measurement.",
    "Expected contributions include clarifying mechanisms, testing hypotheses under explicit assumptions, and outlining implications for policy or practice conditional on empirical support.",
    "The remainder of the thesis develops literature foundations, empirical design, results, and a concise discussion of limitations and future research directions.",
    "The empirical section reports estimation outputs in tabular form, discusses economic magnitudes alongside statistical significance, and documents robustness exercises that probe sensitivity to alternative samples, controls, and window definitions where applicable.",
    "Finally, the discussion synthesizes findings with theory, states limitations transparently, and proposes focused extensions that would most improve identification or external validity in follow-on work.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function fallbackSectionDraft(section: OutlineSection) {
  const purpose = escapeLatex(
    section.purpose || "Clarify the goal of this section in relation to the research question.",
  );
  return `\\section{Section framing}
\\subsection{Purpose and scope}
This draft section is a structured starting point and should be expanded with project-specific evidence, citations, and argumentation.

\\subsection{Core concepts and definitions}
\\textbf{Purpose:} ${purpose}

\\section{Analysis development}
\\subsection{Main argument and evidence}
Develop one claim at a time, followed by evidence and short interpretation.

\\subsection{Limitations and transition}
State methodological limits and transition to the next chapter.

\\subsubsection{Citation placeholders}
\\texttt{[Ref: verify and replace with exact source]}

\\textit{${escapeLatex(integrityNotice)}}`;
}

function stripMarkdownLatexArtifacts(input: string): string {
  return input
    .replace(/```latex/gi, "")
    .replace(/```/g, "")
    .replace(/\(author\?\)/gi, "")
    .replace(/Figure~(?!\\ref\{)/g, "Figure ")
    .trim();
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

  const promptTopic = payload.data.prompt.trim().replace(/[.?!]+$/, "");
  const promptWords = countPromptWords(promptTopic);

  const papers = await prisma.referencePaper.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
  });

  const inferredTitle =
    project.title.trim().length >= 5 && !looksPlaceholderTitle(project.title)
      ? project.title.trim()
      : inferProjectTitleFromPrompt(promptTopic || "research topic");
  const inferredField = project.field.trim().length >= 3 ? project.field.trim() : "Academic research";
  const inferredResearchQuestion =
    project.researchQuestion.trim().length >= 12
      ? project.researchQuestion.trim()
      : `How does ${promptTopic || "this topic"} relate to current academic literature and practical applications?`;

  const highQualityThesis = detectHighQualityThesisMode({
    highQualityFlag: payload.data.highQualityThesis,
    prompt: payload.data.prompt,
  });

  const inputIssues = validateThesisUserInputs({
    title: inferredTitle,
    field: inferredField,
    researchQuestion: inferredResearchQuestion,
    description: project.description,
    userPrompt: payload.data.prompt,
    sourceCount: papers.length,
  });
  console.log("[full-draft] validation", {
    projectId: id,
    prompt: payload.data.prompt,
    inferredTitle,
    inferredField,
    inferredResearchQuestion,
    promptWords,
    sources: papers.length,
    issues: inputIssues.map((i) => i.code),
  });
  if (inputIssues.length > 0) {
    return NextResponse.json(
      { error: "Thesis inputs look incomplete or placeholder-like. Refine the project title, field, research question, or prompt.", issues: inputIssues },
      { status: 400 },
    );
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

  if (papers.length === 0 && promptWords < 8) {
    return NextResponse.json({ error: "Provide a meaningful prompt (at least 8 words) or import sources first." }, { status: 400 });
  }

  if (project.title !== inferredTitle || project.field !== inferredField || project.researchQuestion !== inferredResearchQuestion) {
    await prisma.project.update({
      where: { id },
      data: {
        title: inferredTitle,
        field: inferredField,
        researchQuestion: inferredResearchQuestion,
      },
    });
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

  let outlineSections = parseOutlineSections(outlineRows);
  if (!hasCanonicalFiveChapterCoverage(outlineSections)) {
    outlineSections = canonicalFiveChapterOutline();
  }
  if (outlineSections.length === 0) {
    return NextResponse.json(
      { error: "Generate an outline first before creating full draft chapters." },
      { status: 400 },
    );
  }

  const referenceSnippets = buildReferenceSnippets(papers);
  const targetPages = parseTargetPagesFromPrompt(payload.data.prompt);
  const totalTargetWords = estimateWordBudgetFromPages(targetPages);
  const scaledSections = allocateSectionWordTargets(outlineSections, totalTargetWords);
  const drafts: { title: string; content: string }[] = [];

  const composedGlobalPrompt = payload.data.prompt;
  const technical = projectUsesEarlyChapterMathDelay(inferredField);
  const hasDataset = hasUploadedDatasetFilenames(papers.map((p) => p.originalName || ""));

  let thesisBlueprint = "";
  if (highQualityThesis) {
    thesisBlueprint = (
      await openAiThesisText(
        buildBlueprintPrompt({
          project: {
            title: inferredTitle,
            field: inferredField,
            degreeLevel: project.degreeLevel,
            researchQuestion: inferredResearchQuestion,
            description: project.description,
          },
          chapterTitles: scaledSections.map((s) => s.title),
          globalPrompt: composedGlobalPrompt,
          references: referenceSnippets,
        }),
        HQ_BLUEPRINT_TOKENS,
      )
    ).trim();
  }

  const abstractMaxTok = highQualityThesis ? HQ_ABSTRACT_TOKENS : ABSTRACT_MAX_OUTPUT_TOKENS;
  const skeletonMaxTok = highQualityThesis ? HQ_SKELETON_TOKENS : SKELETON_MAX_OUTPUT_TOKENS;
  const qualityRepairMaxTok = highQualityThesis ? HQ_QUALITY_REPAIR_TOKENS : QUALITY_REPAIR_MAX_TOKENS;
  const maxQualityRepairPasses = highQualityThesis ? HQ_MAX_QUALITY_ROUNDS : MAX_QUALITY_REPAIR_PASSES;
  const maxSectionExpansionPasses = highQualityThesis ? 3 : MAX_SECTION_EXPANSION_PASSES;
  const maxStructureRepairPasses = highQualityThesis ? 3 : MAX_STRUCTURE_REPAIR_PASSES;
  const maxAbstractExpansionPasses = highQualityThesis ? 3 : MAX_ABSTRACT_EXPANSION_PASSES;

  let abstractLatex = sanitizeThesisLatexMath(
    await openAiThesisText(
      buildAbstractPrompt({
        project: {
          title: inferredTitle,
          field: inferredField,
          degreeLevel: project.degreeLevel,
          language: project.language,
          researchQuestion: inferredResearchQuestion,
          description: project.description,
        },
        globalPrompt: composedGlobalPrompt,
        references: referenceSnippets,
        technicalPipeline: technical,
      }),
      abstractMaxTok,
    ),
  );
  abstractLatex = stripMarkdownLatexArtifacts(abstractLatex);
  let abstractIssue = auditAbstractLatex(abstractLatex, { technicalPipeline: technical });
  let abstractPass = 0;
  while (abstractIssue && abstractPass < maxAbstractExpansionPasses) {
    abstractLatex = sanitizeThesisLatexMath(
      await openAiThesisText(
        buildAbstractExpansionPrompt({
          existing: abstractLatex,
          targetMinWords: 160,
          references: referenceSnippets,
        }),
        abstractMaxTok,
      ),
    );
    abstractIssue = auditAbstractLatex(abstractLatex, { technicalPipeline: technical });
    abstractPass += 1;
  }
  if (auditAbstractLatex(abstractLatex, { technicalPipeline: technical })) {
    abstractLatex = buildFallbackAbstractLatex({
      ...project,
      title: inferredTitle,
      field: inferredField,
      researchQuestion: inferredResearchQuestion,
    });
  }
  if (technical) {
    abstractLatex = stripDisplayedMathFromBody(abstractLatex);
  }

  for (let chapterIndex = 0; chapterIndex < scaledSections.length; chapterIndex++) {
    const section = scaledSections[chapterIndex];
    const targetWords = Math.max(650, section.target_words || 0);
    const chapterKind = inferThesisChapterKind(section.title);

    const skeletonRaw = await openAiThesisText(
      buildSkeletonPrompt({
        project: {
          title: inferredTitle,
          field: inferredField,
          degreeLevel: project.degreeLevel,
          language: project.language,
          researchQuestion: inferredResearchQuestion,
        },
        section,
        references: referenceSnippets,
        thesisBlueprint,
        highQualityThesis,
        chapterKind,
      }),
      skeletonMaxTok,
    );
    const skeleton = sanitizeThesisLatexMath(skeletonRaw || "");

    const prompt = buildSectionPrompt({
      project: {
        title: inferredTitle,
        field: inferredField,
        degreeLevel: project.degreeLevel,
        language: project.language,
        researchQuestion: inferredResearchQuestion,
        description: project.description,
      },
      globalPrompt: composedGlobalPrompt,
      section,
      references: referenceSnippets,
      targetWords,
      targetPages,
      chapterKind,
      skeleton,
      chapterOrderIndex: chapterIndex,
      technicalPipeline: technical,
      thesisBlueprint,
      highQualityThesis,
      hasDataset,
    });

    const maxOut = highQualityThesis
      ? chapterKind === "methodology" || chapterKind === "results"
        ? HQ_SECTION_DEEP_TOKENS
        : HQ_SECTION_MAX_TOKENS
      : chapterKind === "methodology" || chapterKind === "results"
        ? SECTION_MAX_OUTPUT_TOKENS_DEEP
        : SECTION_MAX_OUTPUT_TOKENS;

    let text = await openAiThesisText(prompt, maxOut);

    let combinedText = sanitizeThesisLatexMath(text || fallbackSectionDraft(section));
    let currentWords = countApproxWords(combinedText);
    let pass = 0;

    while (currentWords < targetWords * 0.85 && pass < maxSectionExpansionPasses) {
      const remainingWords = Math.max(220, Math.round(targetWords - currentWords));
      const expansionPrompt = buildExpansionPrompt({
        section,
        existingDraft: combinedText,
        references: referenceSnippets,
        remainingWords,
      });

      const extra = await openAiThesisText(expansionPrompt, maxOut);
      if (!extra) break;
      combinedText = sanitizeThesisLatexMath(`${combinedText}\n\n${extra}`);
      combinedText = stripMarkdownLatexArtifacts(combinedText);
      currentWords = countApproxWords(combinedText);

      pass += 1;
    }

    let structurePass = 0;
    let hierarchyCheck = draftHasDenseHierarchy(combinedText);
    while (!hierarchyCheck.isValid && structurePass < maxStructureRepairPasses) {
      const repairPrompt = buildStructureRepairPrompt({
        section,
        existingDraft: combinedText,
        references: referenceSnippets,
      });
      const revised = await openAiThesisText(repairPrompt, maxOut);
      if (!revised) break;
      combinedText = sanitizeThesisLatexMath(revised);
      combinedText = stripMarkdownLatexArtifacts(combinedText);
      hierarchyCheck = draftHasDenseHierarchy(combinedText);
      structurePass += 1;
    }

    if (!hierarchyCheck.isValid) {
      const scaffold = buildFallbackHierarchy(section)
        .map((node) => {
          const subsectionBlocks = (node.subsections || [])
            .map((sub) => {
              const leaves = (sub.subsubsections || [])
                .map((leaf) => `\\subsubsection{${escapeLatex(leaf)}}\nAdd focused technical detail, evidence handling, and interpretation.`)
                .join("\n\n");
              return `\\subsection{${escapeLatex(sub.title)}}\n${escapeLatex(
                sub.focus || "Develop a specific argument with evidence and interpretation.",
              )}\n\n${leaves}`.trim();
            })
            .join("\n\n");
          return `\\section{${escapeLatex(node.title)}}\n${subsectionBlocks}`;
        })
        .join("\n\n");
      combinedText = sanitizeThesisLatexMath(`${scaffold}\n\n${combinedText}`);
    }

    combinedText = sanitizeThesisLatexMath(combinedText);
    combinedText = stripMarkdownLatexArtifacts(combinedText);

    let qualityIssues = auditChapterBody(combinedText, chapterKind, {
      chapterOrderIndex: chapterIndex,
      technicalPipeline: technical,
    });
    let qPass = 0;
    while (qualityIssues.length > 0 && qPass < maxQualityRepairPasses) {
      const repairQ = buildQualityRepairPrompt({
        chapterTitle: section.title,
        kind: chapterKind,
        issues: qualityIssues,
        existingDraft: combinedText,
        references: referenceSnippets,
        highQualityMode: highQualityThesis,
      });
      const fixed = await openAiThesisText(repairQ, qualityRepairMaxTok);
      if (!fixed) break;
      combinedText = sanitizeThesisLatexMath(fixed);
      combinedText = stripMarkdownLatexArtifacts(combinedText);
      qualityIssues = auditChapterBody(combinedText, chapterKind, {
        chapterOrderIndex: chapterIndex,
        technicalPipeline: technical,
      });
      qPass += 1;
    }

    if (technical && chapterIndex < 2) {
      combinedText = stripDisplayedMathFromBody(combinedText);
    }

    if (highQualityThesis && chapterIndex === 0 && chapterKind === "introduction") {
      const deduped = await openAiThesisText(
        buildIntroDedupePrompt({ existingDraft: combinedText, references: referenceSnippets }),
        HQ_DEDUPE_TOKENS,
      );
      if (deduped.trim()) {
        combinedText = sanitizeThesisLatexMath(deduped);
        combinedText = stripMarkdownLatexArtifacts(combinedText);
        combinedText = stripDisplayedMathFromBody(combinedText);
      }
    }

    combinedText = appendFigurePlaceholdersForChapter(combinedText, {
      chapterOrderIndex: chapterIndex,
      chapterKind,
      technical,
      highQuality: technical,
    });

    drafts.push({
      title: section.title,
      content: combinedText,
    });
  }

  ensureGlobalFigureMinimum(drafts, technical, { highQuality: technical });
  injectHighQualityFiguresAndTables(drafts, { technical });

  if (highQualityThesis) {
    for (let phRound = 0; phRound < 2; phRound++) {
      const combinedHits = auditCombinedThesisBodies({ abstractLatex, chapters: drafts });
      if (combinedHits.length === 0) break;

      const absHits = auditTextForPlaceholderLeaks(abstractLatex);
      if (absHits.length > 0) {
        const repairedAbs = await openAiThesisText(
          buildAntiPlaceholderAbstractPrompt({ body: abstractLatex, hits: absHits }),
          qualityRepairMaxTok,
        );
        if (repairedAbs.trim()) {
          abstractLatex = sanitizeThesisLatexMath(repairedAbs);
          abstractLatex = stripMarkdownLatexArtifacts(abstractLatex);
          if (technical) abstractLatex = stripDisplayedMathFromBody(abstractLatex);
        }
      }

      for (let i = 0; i < drafts.length; i++) {
        const chHits = auditTextForPlaceholderLeaks(drafts[i].content);
        if (chHits.length === 0) continue;
        const repaired = await openAiThesisText(
          buildAntiPlaceholderChapterPrompt({
            chapterTitle: drafts[i].title,
            body: drafts[i].content,
            hits: chHits,
          }),
          qualityRepairMaxTok,
        );
        if (repaired.trim()) {
          drafts[i].content = sanitizeThesisLatexMath(repaired);
          drafts[i].content = stripMarkdownLatexArtifacts(drafts[i].content);
          if (technical && i < 2) {
            drafts[i].content = stripDisplayedMathFromBody(drafts[i].content);
          }
        }
      }
    }
  }

  if (technical) {
    for (let i = 0; i < Math.min(2, drafts.length); i++) {
      drafts[i].content = stripDisplayedMathFromBody(drafts[i].content);
    }
    abstractLatex = stripDisplayedMathFromBody(abstractLatex);
  }

  const placeholderHits = auditCombinedThesisBodies({ abstractLatex, chapters: drafts });
  const hqGateIssues =
    technical && highQualityThesis
      ? auditHighQualityFinalGate({ abstractLatex, drafts, technicalPipeline: technical })
      : [];

  await prisma.$transaction(async (tx) => {
    // Drop autosaved studio buffer so GET live-draft serves the new combined draft, not a cached outline / old text.
    await tx.documentSection.deleteMany({
      where: { projectId: id, sectionType: "live_draft" },
    });
    await tx.documentSection.deleteMany({
      where: { projectId: id, sectionType: "draft_chapter" },
    });
    await tx.documentSection.deleteMany({
      where: { projectId: id, sectionType: "draft_abstract" },
    });

    await tx.documentSection.create({
      data: {
        projectId: id,
        title: "Generated abstract",
        sectionType: "draft_abstract",
        content: abstractLatex,
      },
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

  const qualityWarnings = [
    ...placeholderHits.map((h) => `${h.code}: ${h.message}`),
    ...hqGateIssues.map((i) => `${i.code}: ${i.detail}`),
  ];
  const citationsInserted = countMatches(
    [abstractLatex, ...drafts.map((d) => d.content)].join("\n"),
    /\[(\d{1,3})\]|\\cite[tp]?\{/g,
  );
  console.log("[full-draft] final", {
    projectId: id,
    inferredTitle,
    sourcesUsed: papers.length,
    citationsInserted,
    qualityGatePassed: qualityWarnings.length === 0,
    qualityWarnings,
  });

  return NextResponse.json({
    success: true,
    highQualityThesis,
    sectionsCreated: drafts.length,
    message: highQualityThesis
      ? "High-quality thesis draft generated (multi-pass blueprint, per-section drafting, TikZ/pgfplots injection, sanitation, deduplication, and audits). Review qualityWarnings if any; export PDF/LaTeX to compile."
      : "Thesis draft generated (multi-pass: abstract, per-chapter skeleton, full chapters, LaTeX sanitation, and quality repair where needed). Export PDF/LaTeX to compile.",
    ...(qualityWarnings.length > 0 ? { qualityWarnings } : {}),
  });
}
