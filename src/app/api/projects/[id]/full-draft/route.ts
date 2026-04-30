import { NextResponse } from "next/server";
import { after } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";
import { escapeLatex } from "@/lib/latex-escape";
import { integrityNotice } from "@/lib/review-modes";
import {
  ensureThesisGenerationAllowed,
  ensureUsageAllowed,
  incrementThesisGenerationUsage,
  incrementUsage,
} from "@/lib/usage";
import {
  countWords,
  getFallbackModel,
  getInputCharLimit,
  getInputWordLimit,
  getModel,
} from "@/lib/ai-config";
import { sanitizeThesisLatexMath } from "@/lib/latex-math-sanitize";
import {
  buildUploadOnlyCitationRules,
  chapterKindGuidance,
  inferThesisChapterKind,
  projectUsesEarlyChapterMathDelay,
  projectWantsEconometricsDepth,
  THESIS_DOCUMENT_SCHEMA,
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
  auditFullThesisQualityGate,
  buildFullDraftQualityDiagnostics,
  buildGateRepairAbstractPrompt,
  buildGateRepairChapterPrompt,
  buildQualityRepairPrompt,
  classifyQualityGateHitSeverity,
  filterGateHitsForChapterRepair,
} from "@/lib/thesis-quality-audit";
import {
  detectHighQualityThesisMode,
  HQ_ABSTRACT_TOKENS,
  HQ_BLUEPRINT_TOKENS,
  HQ_MAX_QUALITY_ROUNDS,
  HQ_QUALITY_REPAIR_TOKENS,
  HQ_SECTION_DEEP_TOKENS,
  HQ_SECTION_MAX_TOKENS,
} from "@/lib/thesis-high-quality";
import {
  isUntrustedProjectTitle,
  isUntrustedResearchQuestion,
  validateThesisUserInputs,
} from "@/lib/thesis-input-validation";
import {
  auditCombinedThesisBodies,
  auditTextForPlaceholderLeaks,
  buildAntiPlaceholderAbstractPrompt,
  buildAntiPlaceholderChapterPrompt,
} from "@/lib/thesis-placeholder-audit";
import { injectHighQualityFiguresAndTables } from "@/lib/thesis-figures-tables";
import { sanitizeBlankCitationsInLatex } from "@/lib/thesis-citation-sanitize";
import {
  adaptScaffoldToOutlineTitle,
  buildStrictStructureRepairPrompt,
  flattenScaffoldSlots,
  formatStructureConstraintsJson,
  getChapterScaffold,
  renderScaffoldHeadingsOnlyLatex,
  renderScaffoldMinimalPlaceholderBody,
  validateChapterStructureAgainstScaffold,
} from "@/lib/thesis-chapter-scaffold";

/** Vercel / platform limit; `after()` continues work after the 202 response but still shares this ceiling. */
export const maxDuration = 300;

const bodySchema = z.object({
  prompt: z.string().min(8),
  highQualityThesis: z.boolean().optional(),
});

const SECTION_MAX_OUTPUT_TOKENS = 3000;
const SECTION_MAX_OUTPUT_TOKENS_DEEP = 4200;
const ABSTRACT_MAX_OUTPUT_TOKENS = 900;
const QUALITY_REPAIR_MAX_TOKENS = 2800;
const MAX_REFERENCE_SNIPPET_CHARS = 18000;
const MAX_SECTION_EXPANSION_PASSES = 2;
const MAX_STRUCTURE_REPAIR_PASSES = 2;
const MAX_ABSTRACT_EXPANSION_PASSES = 2;
const MAX_QUALITY_REPAIR_PASSES = 2;
const THESIS_DRAFT_TEMPERATURE = 0.2;
const THESIS_DRAFT_SEED = Number.parseInt(process.env.SCHOLARFLOW_THESIS_SEED || "", 10);
const THESIS_DRAFT_SEED_AVAILABLE = Number.isFinite(THESIS_DRAFT_SEED);

type GenerationMode = "hq_one_shot_chapter" | "subsection_slot_fill" | "fallback_placeholder" | "repaired_output";
type RunDiagnostics = {
  jobId: string;
  inputHash: string;
  sourceCount: number;
  sourceHash: string;
  outlineHash: string;
  selectedPipelinePath: string;
  selectedModel: string;
  temperature: number;
  maxTokensObserved: number;
  fallbackModelUsed: boolean;
  generationMode: GenerationMode;
  seedAvailable: boolean;
  seedValue?: number;
  oneShotUsed: boolean;
  slotFillUsed: boolean;
  repairTriggered: boolean;
  deterministicPlaceholderFallbackTriggered: boolean;
  finalQualityScore: number;
};

/** Rolling LaTeX tail passed into each subsection call so the model keeps chapter thread (chars). */
const CHAPTER_PRIOR_CONTEXT_CHARS_DEFAULT = 5_500;
const CHAPTER_PRIOR_CONTEXT_CHARS_HQ = 14_000;

function countPromptWords(input: string) {
  return input.trim().split(/\s+/).filter(Boolean).length;
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

function tryRepairOutlineJson(raw: string): string {
  let s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return s;
}

function parseOutlineSections(rawSections: { title: string; content: string }[]): OutlineSection[] {
  const parsed: OutlineSection[] = [];
  for (const section of rawSections) {
    const tryParse = (input: string) => {
      const json = JSON.parse(input) as OutlineSection;
      if (!json?.title) return;
      const normalizedSections = Array.isArray(json.sections)
        ? json.sections.map(normalizeSectionNode).filter((v): v is OutlineSectionNode => Boolean(v))
        : [];
      parsed.push({
        ...json,
        title: String(json.title).trim(),
        purpose: json.purpose ? String(json.purpose).trim() : undefined,
        sections: normalizedSections.length > 0 ? normalizedSections : buildFallbackHierarchy(json),
      });
    };
    try {
      tryParse(section.content);
    } catch {
      try {
        tryParse(tryRepairOutlineJson(section.content));
      } catch {
        // ignore invalid json
      }
    }
  }
  return parsed;
}

function countMatches(input: string, re: RegExp) {
  return (input.match(re) || []).length;
}

function draftHasDenseHierarchy(body: string, kind?: ThesisChapterKind) {
  const sectionCount = countMatches(body, /\\section\*?\{[^}]+\}/g);
  const subsectionCount = countMatches(body, /\\subsection\*?\{[^}]+\}/g);
  const subsubsectionCount = countMatches(body, /\\subsubsection\*?\{[^}]+\}/g);
  const hasFlatWall = sectionCount === 0 && body.replace(/\s+/g, " ").trim().length > 2500;
  const words = countApproxWords(body);
  const subsectionFloor = Math.max(2, Math.max(3, sectionCount * 2 - 2));
  /** One outline chapter = one \\section + fixed subsections (structure-first pipeline). */
  const templateChapterOk = !hasFlatWall && sectionCount >= 1 && subsectionCount >= 3;
  const legacyDenseOk =
    !hasFlatWall &&
    sectionCount >= 3 &&
    subsectionCount >= subsectionFloor &&
    (words < 500 || subsectionCount >= 2);
  let isValid: boolean;
  if (kind === "appendix") {
    isValid =
      !hasFlatWall &&
      (subsectionCount >= 3 || (sectionCount >= 2 && subsectionCount >= 2));
  } else {
    isValid = templateChapterOk || legacyDenseOk;
  }
  return { isValid, sectionCount, subsectionCount, subsubsectionCount };
}

export type SkippedSourceInfo = { filename: string; reason: string };

function buildReferenceSnippets(papers: { originalName: string; extractedText: string }[]): {
  snippets: string;
  skippedSources: SkippedSourceInfo[];
  usedSourceCount: number;
  charEstimate: number;
} {
  const skippedSources: SkippedSourceInfo[] = [];
  const chunks: string[] = [];
  let total = 0;
  let usedSourceCount = 0;
  for (const paper of papers) {
    const name = paper.originalName || "unnamed";
    if (!paper.extractedText?.trim()) {
      skippedSources.push({ filename: name, reason: "empty_or_missing_extracted_text" });
      continue;
    }
    const header = `\n\n### ${paper.originalName}\n`;
    const remaining = MAX_REFERENCE_SNIPPET_CHARS - total - header.length;
    if (remaining <= 200) {
      skippedSources.push({ filename: name, reason: "reference_context_budget_exceeded" });
      continue;
    }
    const snippet = paper.extractedText.slice(0, Math.min(4500, remaining));
    const piece = `${header}${snippet}`;
    chunks.push(piece);
    total += piece.length;
    usedSourceCount += 1;
  }
  const snippets = chunks.join("\n");
  return { snippets, skippedSources, usedSourceCount, charEstimate: snippets.length };
}

const LLM_ATTEMPTS = 3;
let activeLlmTrace: { selectedModel?: string; fallbackModelUsed?: boolean; maxTokensObserved?: number } | null = null;

async function openAiThesisText(
  prompt: string,
  maxOutputTokens: number,
  logCtx?: { jobId?: string; step?: string; label?: string },
  trace?: { selectedModel?: string; fallbackModelUsed?: boolean; maxTokensObserved?: number },
): Promise<string> {
  const runtimeTrace = trace ?? activeLlmTrace ?? undefined;
  const models = [getModel(), getFallbackModel()];
  let lastErr: unknown;
  if (runtimeTrace) {
    runtimeTrace.maxTokensObserved = Math.max(runtimeTrace.maxTokensObserved || 0, maxOutputTokens);
  }
  for (const model of models) {
    for (let attempt = 1; attempt <= LLM_ATTEMPTS; attempt++) {
      try {
        const requestPayload: Record<string, unknown> = {
          model,
          input: prompt,
          max_output_tokens: maxOutputTokens,
          temperature: THESIS_DRAFT_TEMPERATURE,
        };
        if (THESIS_DRAFT_SEED_AVAILABLE) requestPayload.seed = THESIS_DRAFT_SEED;
        const response = await openai.responses.create(requestPayload as never);
        const text = response.output_text?.trim() || "";
        if (runtimeTrace && text) {
          runtimeTrace.selectedModel = model;
          runtimeTrace.fallbackModelUsed = model === models[1];
        }
        if (text || attempt === LLM_ATTEMPTS) return text;
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[full-draft] openAiThesisText attempt failed", {
          jobId: logCtx?.jobId,
          step: logCtx?.step,
          label: logCtx?.label,
          model,
          attempt,
          message: msg,
          stack: err instanceof Error ? err.stack : undefined,
        });
      }
    }
  }
  if (lastErr) {
    console.error("[full-draft] openAiThesisText exhausted retries", {
      jobId: logCtx?.jobId,
      step: logCtx?.step,
      label: logCtx?.label,
      lastMessage: lastErr instanceof Error ? lastErr.message : String(lastErr),
    });
  }
  return "";
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
  citationRulesBlock: string;
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

${args.citationRulesBlock}

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

function stripModelSectionHeadingsFromFragment(frag: string): string {
  return frag
    .replace(/\\section\*?\{[^}]*\}\s*/g, "")
    .replace(/\\subsection\*?\{[^}]*\}\s*/g, "")
    .replace(/\\subsubsection\*?\{[^}]*\}\s*/g, "");
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function buildSubsectionFillPrompt(args: {
  strictPrefix: string;
  constraintsJson: string;
  sectionTitle: string;
  subsectionTitle: string;
  minParagraphs: number;
  extraRules?: string;
  wordsBudget: number;
  priorChapterContext: string;
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
  chapterKind: ThesisChapterKind;
  chapterOrderIndex: number;
  slotIndex: number;
  slotTotal: number;
  technicalPipeline: boolean;
  thesisBlueprint?: string;
  highQualityThesis?: boolean;
  hasDataset?: boolean;
  citationRulesBlock: string;
  targetWords: number;
  targetPages: number;
}): string {
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
- Deliver substantive content, link explicitly to the research question, then transition forward.
- In empirical Results fragments: what is estimated or shown; headline result; interpretation; limitation or caution.
`.trim()
    : "";
  const noDatasetBlock = args.hasDataset
    ? ""
    : `
Dataset availability constraint:
- No structured dataset upload was detected.
- Do NOT invent empirical coefficients, sample sizes, p-values, benchmark scores, or "observed" results.
- Write as literature-grounded analysis with a proposed empirical strategy and explicit limitations.
`.trim();

  const slotCoherenceBlock =
    args.slotTotal > 1
      ? `
Chapter coherence (you are writing subsection ${args.slotIndex + 1} of ${args.slotTotal} in this chapter file):
- The block below ("End of chapter drafted so far") is the real preceding text—match its terminology, claims, and arc.
- Continue the narrative; do not rewrite the opening or contradict earlier subsections unless you explicitly reconcile a limitation.
`.trim()
      : "";

  return `
${args.strictPrefix}You are ThesisPilot filling EXACTLY ONE SUBSECTION of a thesis chapter (structure-first pipeline; Pass 4b).

VALIDATOR-ALIGNED CONSTRAINTS (JSON — your prose must allow the assembled chapter to satisfy these checks):
${args.constraintsJson}

HARD RULES FOR THIS RESPONSE:
- Output LaTeX FRAGMENTS only (paragraphs, itemize, equations, tables, figures as needed).
- DO NOT output \\section, \\subsection, \\subsubsection, \\chapter, or \\part — the system inserts all headings.
- Write at least ${args.minParagraphs} academic paragraphs in this fragment (minimum). If unsure, still write substantive placeholder analysis; do not omit paragraphs.
- Target roughly ${args.wordsBudget} words for this fragment alone.
- DO NOT skip this subsection or leave only a sentence; keep the global chapter structure intact for downstream validation.
${args.extraRules ? `\nMANDATORY FOR THIS SUBSECTION:\n${args.extraRules}\n` : ""}

${THESIS_DOCUMENT_SCHEMA}

Chapter slot (for topical continuity):
- Outline chapter title: ${args.section.title}
- Current \\section title (fixed in document): ${args.sectionTitle}
- Current \\subsection title (you write body ONLY under this heading — it will appear as): ${args.subsectionTitle}

Whole-chapter word target: ${args.targetWords} (this fragment is one part of that budget). Document page target: ${args.targetPages}.

${slotCoherenceBlock ? `${slotCoherenceBlock}\n\n` : ""}End of chapter drafted so far (continue naturally; do not repeat verbatim):
${args.priorChapterContext || "(chapter start — write an opening that fits the first subsection.)"}

Project:
- Title: ${args.project.title}
- Field: ${args.project.field}
- Level: ${args.project.degreeLevel}
- Language: ${args.project.language}
- Research question: ${args.project.researchQuestion}
- Description: ${args.project.description || ""}

User one-prompt instruction:
${args.globalPrompt}

Outline purpose / tasks for this chapter:
- Purpose: ${args.section.purpose || ""}
- Key points from references: ${(args.section.key_points_from_references || []).join("; ")}
- Student writing tasks: ${(args.section.student_writing_tasks || []).join("; ")}

Reference excerpts:
${args.references}

Citation and attribution (follow exactly):
${args.citationRulesBlock}

${THESIS_FILLER_BAN}
${econBlock}
${chapterGuidanceBlock}
${hqIntroBlock}
${blueprintBlock}
${flowBlock}
${noDatasetBlock}
${mathRulesBlock}
${figureRulesBlock}
${
  earlyTechnical
    ? "Math for this chapter: prefer narrative; light \\( ... \\) only if indispensable; no display equation environments in early technical chapters."
    : "Math: use \\( ... \\) or \\[ ... \\] as appropriate when this subsection needs formal notation."
}
`.trim();
}

function buildChapterOneShotPrompt(args: {
  strictPrefix: string;
  constraintsJson: string;
  mandatoryHeadingLines: string;
  chapterTitle: string;
  targetWords: number;
  targetPages: number;
  chapterKind: ThesisChapterKind;
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
  highQualityThesis?: boolean;
  hasDataset?: boolean;
  thesisBlueprint?: string;
  citationRulesBlock: string;
}): string {
  const earlyTechnical = args.technicalPipeline && (args.chapterKind === "introduction" || args.chapterKind === "literature");
  const econBlock = projectWantsEconometricsDepth(args.project.field) && !earlyTechnical ? `\n${THESIS_ECONOMETRICS_DEPTH}\n` : "";
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
    args.highQualityThesis && args.chapterKind === "results" ? THESIS_RESULTS_TABLE_GUIDE_HQ : chapterKindGuidance(args.chapterKind);
  const blueprintBlock = args.thesisBlueprint?.trim()
    ? `\nThesis blueprint (stay aligned; do not contradict):\n${args.thesisBlueprint.trim().slice(0, 12000)}\n`
    : "";
  const noDatasetBlock = args.hasDataset
    ? ""
    : `
Dataset availability constraint:
- No structured dataset upload was detected.
- Do NOT invent empirical coefficients, sample sizes, p-values, benchmark scores, or "observed" results.
- Write as literature-grounded analysis with a proposed empirical strategy and explicit limitations.
`.trim();

  return `
${args.strictPrefix}You are ThesisPilot drafting ONE COMPLETE chapter body in one pass (deterministic structure-first pipeline).

VALIDATOR-ALIGNED CONSTRAINTS (JSON):
${args.constraintsJson}

HARD RULES:
- Return valid LaTeX BODY only. No preamble and no \\chapter.
- Use the exact heading template below once each (no extra \\section names, no heading renames).
- Fill substantive text under every required \\subsection.
- Target approximately ${args.targetWords} words for this chapter (document target ${args.targetPages} pages).
- Keep coherent narrative and transitions across subsections.

MANDATORY HEADING TEMPLATE (must appear exactly and in order):
${args.mandatoryHeadingLines}

Project:
- Title: ${args.project.title}
- Field: ${args.project.field}
- Level: ${args.project.degreeLevel}
- Language: ${args.project.language}
- Research question: ${args.project.researchQuestion}
- Description: ${args.project.description || ""}

User one-prompt instruction:
${args.globalPrompt}

Chapter title:
${args.chapterTitle}

Reference excerpts:
${args.references}

Citation and attribution:
${args.citationRulesBlock}

${THESIS_DOCUMENT_SCHEMA}
${THESIS_FILLER_BAN}
${chapterGuidanceBlock}
${econBlock}
${mathRulesBlock}
${figureRulesBlock}
${blueprintBlock}
${noDatasetBlock}
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
- HARD: preserve every existing \\section and \\subsection heading exactly (same titles, same order). Do not remove, rename, or merge required headings.
- You may add \\subsubsection blocks or new paragraphs under existing headings; do not replace the structure-first scaffold with a different outline.

Existing draft:
${args.existingDraft}

Reference excerpts:
${args.references}
`.trim();
}

function ensureMinimumSubsections(body: string, chapterTitle: string, minSubsections: number): string {
  const current = countMatches(body, /\\subsection\*?\{[^}]+\}/g);
  if (current >= minSubsections) return body;
  const missing = minSubsections - current;
  const additions: string[] = [];
  for (let i = 0; i < missing; i++) {
    const idx = current + i + 1;
    additions.push(
      `\\subsection{${escapeLatex(`Additional Analysis ${idx}`)}}\n` +
        `This subsection is included to preserve the required thesis structure for "${escapeLatex(chapterTitle)}". ` +
        `Expand with topic-specific evidence, citations, and interpretation before submission.`,
    );
  }
  return `${body.trim()}\n\n${additions.join("\n\n")}`.trim();
}

function ensureAppendixChapterIfMissing(
  drafts: { title: string; content: string }[],
): { title: string; content: string }[] {
  const hasAppendix = drafts.some((d) => inferThesisChapterKind(d.title) === "appendix");
  if (hasAppendix) return drafts;
  const appendixTitle = "Appendix";
  const appendixBody = `
\\section{Appendix}

\\subsection{Supplementary Tables}
Provide supplementary estimation tables, variable definitions, and robustness outputs referenced in the main text.

\\subsection{Supplementary Figures}
Include additional diagnostics, sensitivity plots, and extended visual evidence that support the Results chapter.

\\subsection{Additional Derivations and Notes}
Add detailed derivations, implementation notes, and reproducibility details that are too long for the core chapters.
`.trim();
  return [...drafts, { title: appendixTitle, content: appendixBody }];
}

function ensureMandatoryTableAndFigure(
  drafts: { title: string; content: string }[],
): { title: string; content: string }[] {
  const totalFigures = drafts.reduce((n, d) => n + countMatches(d.content, /\\begin\{figure\}/g), 0);
  const totalTables = drafts.reduce((n, d) => n + countMatches(d.content, /\\begin\{table\}/g), 0);
  if (totalFigures > 0 && totalTables > 0) return drafts;

  const resultsIdx = drafts.findIndex((d) => inferThesisChapterKind(d.title) === "results");
  const targetIdx = resultsIdx >= 0 ? resultsIdx : Math.max(0, drafts.length - 1);
  const target = drafts[targetIdx];
  if (!target) return drafts;

  const needFigure = totalFigures === 0;
  const needTable = totalTables === 0;
  const figureBlock = `
\\begin{figure}[H]
\\centering
\\fbox{\\begin{minipage}[c][6cm][c]{0.85\\textwidth}\\centering
Placeholder Figure: Replace with project-specific visual evidence.
\\end{minipage}}
\\caption{Core visual evidence supporting the empirical narrative.}
\\label{fig:mandatory_core_evidence}
\\end{figure}
Figure~\\ref{fig:mandatory_core_evidence} summarizes key patterns that should be validated with project data.
`.trim();
  const tableBlock = `
\\begin{table}[H]
\\centering
\\caption{Mandatory summary table for core empirical outputs}
\\label{tab:mandatory_core_summary}
\\begin{tabular}{lcc}
\\toprule
Metric & Baseline & Alternative \\\\
\\midrule
Value A & [fill] & [fill] \\\\
Value B & [fill] & [fill] \\\\
\\bottomrule
\\end{tabular}
\\end{table}
Table~\\ref{tab:mandatory_core_summary} should be replaced with topic-specific estimates and diagnostics.
`.trim();

  const insertion = [needFigure ? figureBlock : "", needTable ? tableBlock : ""].filter(Boolean).join("\n\n");
  drafts[targetIdx] = { ...target, content: `${target.content.trim()}\n\n${insertion}`.trim() };
  return drafts;
}

function enforceMandatoryThesisArtifacts(
  drafts: { title: string; content: string }[],
): { title: string; content: string }[] {
  let out = [...drafts];
  out = ensureAppendixChapterIfMissing(out);
  out = out.map((d) => {
    const kind = inferThesisChapterKind(d.title);
    const minSubsections = kind === "discussion" ? 2 : 3;
    return { ...d, content: ensureMinimumSubsections(d.content, d.title, minSubsections) };
  });
  out = ensureMandatoryTableAndFigure(out);
  return out;
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

function buildStructureRepairPrompt(args: {
  section: OutlineSection;
  existingDraft: string;
  references: string;
  /** When set, headings are frozen (structure-first pipeline). */
  mandatoryHeadingLines?: string;
}) {
  const frozen = args.mandatoryHeadingLines?.trim();
  if (frozen) {
    return `
Revise the chapter draft below for denser academic prose while preserving a frozen heading outline.

Chapter title: ${args.section.title}

FROZEN OUTLINE — every line below MUST appear verbatim as a LaTeX heading in your output, in this exact order. Do not omit, rename, or reorder. You may add \\subsubsection under a \\subsection and expand paragraphs; do not add new top-level \\section blocks.
${frozen}

Requirements:
- Keep valid LaTeX body only (no preamble; no \\chapter).
- Keep argumentation specific, evidence-oriented, and methodologically explicit.
- Break long walls of text into \\subsubsection where helpful.

Existing draft:
${args.existingDraft}

Reference excerpts:
${args.references}
`.trim();
  }
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
  const stripped = input
    .replace(/```latex/gi, "")
    .replace(/```/g, "")
    .replace(/\(author\?\)/gi, "")
    .replace(/Figure~(?!\\ref\{)/g, "Figure ")
    .trim();
  return sanitizeBlankCitationsInLatex(stripped).text;
}

async function persistPartialThesisDraft(
  projectId: string,
  abstractContent: string,
  chapters: { title: string; content: string }[],
  uploadFallbackKeys?: string[],
) {
  const keys = uploadFallbackKeys ?? [];
  const abstractClean = sanitizeBlankCitationsInLatex(abstractContent, { uploadFallbackKeys: keys }).text;
  const chaptersClean = chapters.map((c) => ({
    ...c,
    content: sanitizeBlankCitationsInLatex(c.content, { uploadFallbackKeys: keys }).text,
  }));
  await prisma.$transaction(async (tx) => {
    await tx.documentSection.deleteMany({
      where: { projectId, sectionType: "live_draft" },
    });
    await tx.documentSection.deleteMany({
      where: { projectId, sectionType: "draft_abstract" },
    });
    await tx.documentSection.deleteMany({
      where: { projectId, sectionType: "draft_chapter" },
    });
    await tx.documentSection.create({
      data: {
        projectId,
        title: "Generated abstract",
        sectionType: "draft_abstract",
        content: abstractClean,
      },
    });
    for (const draft of chaptersClean) {
      await tx.documentSection.create({
        data: {
          projectId,
          title: draft.title,
          sectionType: "draft_chapter",
          content: draft.content,
        },
      });
    }
  });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.userId !== session.user.id) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "Missing jobId query parameter." }, { status: 400 });
  }
  const job = await prisma.fullDraftJob.findFirst({ where: { id: jobId, projectId: id } });
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  return NextResponse.json({
    success: job.status === "completed",
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    lastStep: job.lastStep,
    failedStep: job.failedStep,
    message: job.message,
    details: job.details,
    skippedSources: job.skippedSources,
    resultSections: job.resultSections,
  });
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

  const inferredTitle = !isUntrustedProjectTitle(project.title.trim())
    ? project.title.trim()
    : inferProjectTitleFromPrompt(promptTopic || "research topic");
  const inferredField = project.field.trim().length >= 3 ? project.field.trim() : "Academic research";
  const rqRaw = project.researchQuestion.trim();
  const inferredResearchQuestion = !isUntrustedResearchQuestion(rqRaw)
    ? rqRaw
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
  const thesisGenerationCheck = await ensureThesisGenerationAllowed(session.user.id);
  if (!thesisGenerationCheck.allowed) {
    return NextResponse.json(
      { error: "Monthly thesis generation limit reached. Upgrade in pricing.", redirectTo: "/pricing" },
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

  const primaryModel = getModel();
  const fallbackModel = getFallbackModel();
  const job = await prisma.fullDraftJob.create({
    data: {
      projectId: id,
      userId: session.user.id,
      status: "queued",
      progress: 0,
      lastStep: "queued",
      requestPayload: payload.data,
      sourcesTotal: papers.length,
      modelPrimary: primaryModel,
      modelFallback: fallbackModel,
    },
  });
  console.log("[full-draft] queued", {
    jobId: job.id,
    userId: session.user.id,
    projectId: id,
    sourceCount: papers.length,
    sourceFilenames: papers.map((p) => p.originalName),
    promptPreview: payload.data.prompt.slice(0, 500),
    highQualityThesis: detectHighQualityThesisMode({
      highQualityFlag: payload.data.highQualityThesis,
      prompt: payload.data.prompt,
    }),
    primaryModel,
    fallbackModel,
  });
  after(() => {
    void runFullDraftJob(job.id).catch(async (err) => {
      console.error("[full-draft] worker crashed", { jobId: job.id, err });
      await prisma.fullDraftJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          failedStep: "unknown",
          message: err instanceof Error ? err.message : "Unexpected error",
          details: "Unhandled exception in thesis draft worker",
          errorStack: err instanceof Error ? err.stack : String(err),
        },
      });
    });
  });
  return NextResponse.json(
    {
      success: true,
      async: true,
      jobId: job.id,
      message: "Thesis draft job started. Poll GET with ?jobId for status and progress.",
    },
    { status: 202 },
  );
}

async function runFullDraftJob(jobId: string) {
  const jobRow = await prisma.fullDraftJob.findUnique({ where: { id: jobId } });
  if (!jobRow) return;
  const id = jobRow.projectId;
  const payload = bodySchema.safeParse(jobRow.requestPayload);
  if (!payload.success) {
    await prisma.fullDraftJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        failedStep: "queued",
        message: "Stored job prompt was invalid.",
        details: "Recreate the job from the UI.",
      },
    });
    return;
  }

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.userId !== jobRow.userId) {
    await prisma.fullDraftJob.update({
      where: { id: jobId },
      data: { status: "failed", failedStep: "loading_sources", message: "Project not found." },
    });
    return;
  }

  let skippedAggregate: SkippedSourceInfo[] = [];
  const llmTrace: { selectedModel?: string; fallbackModelUsed?: boolean; maxTokensObserved?: number } = {};
  const diagnostics: RunDiagnostics = {
    jobId,
    inputHash: "",
    sourceCount: 0,
    sourceHash: "",
    outlineHash: "",
    selectedPipelinePath: "deterministic_scaffold_one_shot",
    selectedModel: getModel(),
    temperature: THESIS_DRAFT_TEMPERATURE,
    maxTokensObserved: 0,
    fallbackModelUsed: false,
    generationMode: "hq_one_shot_chapter",
    seedAvailable: THESIS_DRAFT_SEED_AVAILABLE,
    seedValue: THESIS_DRAFT_SEED_AVAILABLE ? THESIS_DRAFT_SEED : undefined,
    oneShotUsed: true,
    slotFillUsed: false,
    repairTriggered: false,
    deterministicPlaceholderFallbackTriggered: false,
    finalQualityScore: 0,
  };

  const failJob = async (args: {
    failedStep: string;
    message: string;
    details?: string;
    err?: unknown;
    skippedSources?: SkippedSourceInfo[];
  }) => {
    const stack = args.err instanceof Error ? args.err.stack : args.err ? String(args.err) : null;
    console.error("[full-draft] job failed", {
      jobId,
      projectId: id,
      userId: jobRow.userId,
      failedStep: args.failedStep,
      message: args.message,
      details: args.details,
      stack,
    });
    await prisma.fullDraftJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        failedStep: args.failedStep,
        message: args.message,
        details: JSON.stringify({
          errorDetails: args.details ?? null,
          generationDiagnostics: diagnostics,
        }),
        errorStack: stack,
        skippedSources: (args.skippedSources ?? skippedAggregate) as object | undefined,
      },
    });
  };

  const progress = async (status: string, lastStep: string, pct: number, skipped?: SkippedSourceInfo[]) => {
    if (skipped) skippedAggregate = skipped;
    await prisma.fullDraftJob.update({
      where: { id: jobId },
      data: {
        status,
        lastStep,
        progress: pct,
        ...(skipped ? { skippedSources: skipped as object } : {}),
      },
    });
  };

  try {
    activeLlmTrace = llmTrace;
    await progress("loading_sources", "loading_sources", 6);

    const promptTopic = payload.data.prompt.trim().replace(/[.?!]+$/, "");
    const promptWords = countPromptWords(promptTopic);

    const papers = await prisma.referencePaper.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
    });

    const inferredTitle = !isUntrustedProjectTitle(project.title.trim())
      ? project.title.trim()
      : inferProjectTitleFromPrompt(promptTopic || "research topic");
    const inferredField = project.field.trim().length >= 3 ? project.field.trim() : "Academic research";
    const rqRaw = project.researchQuestion.trim();
    const inferredResearchQuestion = !isUntrustedResearchQuestion(rqRaw)
      ? rqRaw
      : `How does ${promptTopic || "this topic"} relate to current academic literature and practical applications?`;

    const highQualityThesis = detectHighQualityThesisMode({
      highQualityFlag: payload.data.highQualityThesis,
      prompt: payload.data.prompt,
    });
    if (!THESIS_DRAFT_SEED_AVAILABLE) {
      console.log("[full-draft] seed_unavailable", { jobId, reason: "SCHOLARFLOW_THESIS_SEED not configured" });
    }

    const {
      snippets: referenceSnippets,
      skippedSources,
      usedSourceCount,
      charEstimate,
    } = buildReferenceSnippets(papers);

    const citationRulesBlock = buildUploadOnlyCitationRules(papers.map((p) => p.originalName));
    const allowedNatbibKeys = papers.map((_, i) => `uploaded${i + 1}`);
    diagnostics.sourceCount = papers.length;
    diagnostics.sourceHash = sha256(
      papers
        .map((p) => `${p.originalName}::${(p.extractedText || "").slice(0, 2000)}`)
        .join("\n---\n"),
    );

    await prisma.fullDraftJob.update({
      where: { id: jobId },
      data: { referenceChars: charEstimate },
    });

    console.log("[full-draft] sources", {
      jobId,
      projectId: id,
      userId: jobRow.userId,
      totalPapers: papers.length,
      usedSourceCount,
      skippedSources,
      referenceCharEstimate: charEstimate,
      maxReferenceBudget: MAX_REFERENCE_SNIPPET_CHARS,
    });

    await progress("extracting_sources", "extracting_sources", 12, skippedSources);

    if (usedSourceCount === 0 && promptWords < 8) {
      await failJob({
        failedStep: "extracting_sources",
        message: "No usable source text after skipping empty or unreadable sources.",
        details: "Add a longer prompt (8+ words) or re-upload sources so text can be extracted.",
        skippedSources,
      });
      return;
    }

    await progress("planning_outline", "planning_outline", 15);

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
      await failJob({
        failedStep: "planning_outline",
        message: "No usable outline sections were found.",
        details: "Generate an outline from the workspace, then retry full draft.",
        skippedSources,
      });
      return;
    }
    diagnostics.outlineHash = sha256(JSON.stringify(outlineSections));

    const targetPages = parseTargetPagesFromPrompt(payload.data.prompt);
    const totalTargetWords = estimateWordBudgetFromPages(targetPages);
    const scaledSections = allocateSectionWordTargets(outlineSections, totalTargetWords);
    if (!scaledSections.some((s) => inferThesisChapterKind(s.title) === "appendix")) {
      scaledSections.push({
        title: "Appendix",
        purpose:
          "Supplementary material tied to the thesis topic: variable definitions, extended robustness, additional estimators, derivations, or workflow detail. Write substantive content; avoid boilerplate that only tells the reader to replace template numbers.",
        target_words: Math.max(900, Math.round(totalTargetWords * 0.08)),
      });
    }
    const drafts: { title: string; content: string }[] = [];

    const composedGlobalPrompt = payload.data.prompt;
    diagnostics.inputHash = sha256(
      JSON.stringify({
        prompt: composedGlobalPrompt,
        inferredTitle,
        inferredField,
        inferredResearchQuestion,
        highQualityThesis,
        targetPages,
      }),
    );
    const technical = projectUsesEarlyChapterMathDelay(inferredField);
    const hasDataset = hasUploadedDatasetFilenames(papers.map((p) => p.originalName || ""));

    let thesisBlueprint = "";
    try {
      if (highQualityThesis) {
        await progress("drafting_chapters", "drafting_chapters", 17, skippedAggregate);
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
            { jobId, step: "drafting_chapters", label: "thesis_blueprint" },
          )
        ).trim();
      }
    } catch (bpErr) {
      await failJob({
        failedStep: "planning_outline",
        message: "Generation failed at: planning_outline",
        details: `Thesis blueprint step: ${bpErr instanceof Error ? bpErr.message : String(bpErr)}`,
        err: bpErr,
        skippedSources: skippedAggregate,
      });
      return;
    }

    const abstractMaxTok = highQualityThesis ? HQ_ABSTRACT_TOKENS : ABSTRACT_MAX_OUTPUT_TOKENS;
    const qualityRepairMaxTok = highQualityThesis ? HQ_QUALITY_REPAIR_TOKENS : QUALITY_REPAIR_MAX_TOKENS;
    const maxQualityRepairPasses = highQualityThesis ? HQ_MAX_QUALITY_ROUNDS : MAX_QUALITY_REPAIR_PASSES;
    const maxSectionExpansionPasses = highQualityThesis ? 3 : MAX_SECTION_EXPANSION_PASSES;
    const maxStructureRepairPasses = highQualityThesis ? 3 : MAX_STRUCTURE_REPAIR_PASSES;
    const maxAbstractExpansionPasses = highQualityThesis ? 3 : MAX_ABSTRACT_EXPANSION_PASSES;

    let abstractLatex: string;
    try {
      abstractLatex = sanitizeThesisLatexMath(
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
            citationRulesBlock,
          }),
          abstractMaxTok,
          { jobId, step: "drafting_chapters", label: "abstract" },
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
            { jobId, step: "drafting_chapters", label: "abstract_expansion" },
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
    } catch (absErr) {
      await failJob({
        failedStep: "drafting_chapters",
        message: "Generation failed at: drafting_chapters (abstract)",
        details: absErr instanceof Error ? absErr.message : String(absErr),
        err: absErr,
        skippedSources: skippedAggregate,
      });
      return;
    }

    const totalChapters = scaledSections.length;
    for (let chapterIndex = 0; chapterIndex < totalChapters; chapterIndex++) {
      const section = scaledSections[chapterIndex];
      const targetWords = Math.max(650, section.target_words || 0);
      const chapterKind = inferThesisChapterKind(section.title);

      await progress(
        "drafting_chapters",
        "drafting_chapters",
        20 + Math.round((chapterIndex / Math.max(1, totalChapters)) * 55),
        skippedAggregate,
      );

      try {
        const baseScaffold = getChapterScaffold(chapterKind);
        const adaptedScaffold = adaptScaffoldToOutlineTitle(baseScaffold, section.title);
        const constraintsJson = formatStructureConstraintsJson(adaptedScaffold);
        const mandatoryHeadingLines = renderScaffoldHeadingsOnlyLatex(adaptedScaffold);
        const scoreChapterQuality = (body: string) => {
          const issues = auditChapterBody(body, chapterKind, {
            chapterOrderIndex: chapterIndex,
            chapterTitle: section.title,
            technicalPipeline: technical,
            highQualityThesis,
            allowedNatbibKeys,
          }).length;
          const sections = countMatches(body, /\\section\*?\{[^}]+\}/g);
          const subsections = countMatches(body, /\\subsection\*?\{[^}]+\}/g);
          const figures = countMatches(body, /\\begin\{figure\}/g);
          const tables = countMatches(body, /\\begin\{table\}/g);
          const equations = countMatches(body, /\\begin\{equation\*?\}|\\begin\{align\*?\}|\\\[/g);
          const words = countApproxWords(body);
          const score =
            100 -
            issues * 9 +
            sections * 4 +
            subsections * 3 +
            figures * 4 +
            tables * 4 +
            equations * 2 +
            Math.min(18, Math.floor(words / 220));
          return Math.max(0, Math.min(140, score));
        };

        const maxOut = highQualityThesis
          ? chapterKind === "methodology" || chapterKind === "results"
            ? HQ_SECTION_DEEP_TOKENS
            : HQ_SECTION_MAX_TOKENS
          : chapterKind === "methodology" || chapterKind === "results"
            ? SECTION_MAX_OUTPUT_TOKENS_DEEP
            : SECTION_MAX_OUTPUT_TOKENS;

        const MAX_CHAPTER_STRUCTURE_ATTEMPTS = 3;
        let combinedText = "";
        let lastStructMissing: string[] = [];

        for (let structAttempt = 0; structAttempt < MAX_CHAPTER_STRUCTURE_ATTEMPTS; structAttempt++) {
          const strictPrefix =
            structAttempt === 0
              ? ""
              : `CRITICAL — STRUCTURE RETRY ${structAttempt + 1}/${MAX_CHAPTER_STRUCTURE_ATTEMPTS}: a previous assembly failed LaTeX heading validation (${lastStructMissing.join("; ") || "unknown"}).
Regenerate each subsection fragment so the assembled chapter contains EVERY required \\section and \\subsection from the constraints JSON, in order, with EXACT subsection titles.
DO NOT omit subsections. DO NOT rename headings. If evidence is thin, write substantive placeholder paragraphs (at least the minimum per subsection).\n\n`;
          const oneShotPrompt = buildChapterOneShotPrompt({
            strictPrefix,
            constraintsJson,
            mandatoryHeadingLines,
            chapterTitle: section.title,
            targetWords,
            targetPages,
            chapterKind,
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
            highQualityThesis,
            hasDataset,
            thesisBlueprint,
            citationRulesBlock,
          });
          combinedText = sanitizeThesisLatexMath(
            await openAiThesisText(oneShotPrompt, maxOut, {
              jobId,
              step: "drafting_chapters",
              label: `ch_${chapterIndex}_oneshot_a${structAttempt}`,
            }),
          ).trim();
          combinedText = stripMarkdownLatexArtifacts(combinedText);
          const structCheck = validateChapterStructureAgainstScaffold(combinedText, adaptedScaffold);
          lastStructMissing = structCheck.missing;
          console.log("[full-draft] debug_raw_latex", {
            jobId,
            chapterIndex,
            chapterKind,
            chapterTitle: section.title,
            structAttempt,
            scaffoldOk: structCheck.ok,
            missing: structCheck.missing,
            length: combinedText.length,
            preview: combinedText.slice(0, 4000),
            tail: combinedText.slice(-1200),
          });
          if (structCheck.ok) break;
        }

        let structCheckFinal = validateChapterStructureAgainstScaffold(combinedText, adaptedScaffold);
        if (!structCheckFinal.ok && combinedText.trim()) {
          const repairPrompt = buildStrictStructureRepairPrompt({
            missing: structCheckFinal.missing,
            referenceScaffold: renderScaffoldHeadingsOnlyLatex(adaptedScaffold),
            brokenBody: combinedText,
            citationRulesBlock,
          });
          diagnostics.repairTriggered = true;
          const repaired = await openAiThesisText(repairPrompt, maxOut, {
            jobId,
            step: "drafting_chapters",
            label: `strict_structure_repair_${chapterIndex}`,
          });
          if (repaired.trim()) {
            const repairedClean = stripMarkdownLatexArtifacts(sanitizeThesisLatexMath(repaired));
            if (scoreChapterQuality(repairedClean) >= scoreChapterQuality(combinedText)) {
              combinedText = repairedClean;
              diagnostics.generationMode = "repaired_output";
            }
          }
          structCheckFinal = validateChapterStructureAgainstScaffold(combinedText, adaptedScaffold);
          console.log("[full-draft] debug_raw_latex_post_strict_repair", {
            jobId,
            chapterIndex,
            ok: structCheckFinal.ok,
            missing: structCheckFinal.missing,
            preview: combinedText.slice(0, 3500),
          });
        }

        if (!structCheckFinal.ok) {
          const placeholderCandidate = renderScaffoldMinimalPlaceholderBody(adaptedScaffold);
          if (scoreChapterQuality(placeholderCandidate) > scoreChapterQuality(combinedText)) {
            combinedText = placeholderCandidate;
            diagnostics.generationMode = "fallback_placeholder";
            diagnostics.deterministicPlaceholderFallbackTriggered = true;
          }
          console.warn("[full-draft] scaffold_fallback_body", {
            jobId,
            chapterIndex,
            missing: structCheckFinal.missing,
          });
        }

        combinedText = sanitizeThesisLatexMath(combinedText || fallbackSectionDraft(section));
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

          const extra = await openAiThesisText(expansionPrompt, maxOut, {
            jobId,
            step: "drafting_chapters",
            label: `chapter_expand_${chapterIndex}_${pass}`,
          });
          if (!extra) break;
          combinedText = sanitizeThesisLatexMath(`${combinedText}\n\n${extra}`);
          combinedText = stripMarkdownLatexArtifacts(combinedText);
          currentWords = countApproxWords(combinedText);

          pass += 1;
        }

        let structurePass = 0;
        let hierarchyCheck = draftHasDenseHierarchy(combinedText, chapterKind);
        while (!hierarchyCheck.isValid && structurePass < maxStructureRepairPasses) {
          const repairPrompt = buildStructureRepairPrompt({
            section,
            existingDraft: combinedText,
            references: referenceSnippets,
            mandatoryHeadingLines: renderScaffoldHeadingsOnlyLatex(adaptedScaffold),
          });
          diagnostics.repairTriggered = true;
          const revised = await openAiThesisText(repairPrompt, maxOut, {
            jobId,
            step: "drafting_chapters",
            label: `structure_repair_${chapterIndex}_${structurePass}`,
          });
          if (!revised) break;
          const revisedClean = stripMarkdownLatexArtifacts(sanitizeThesisLatexMath(revised));
          if (scoreChapterQuality(revisedClean) >= scoreChapterQuality(combinedText)) {
            combinedText = revisedClean;
            diagnostics.generationMode = "repaired_output";
          }
          hierarchyCheck = draftHasDenseHierarchy(combinedText, chapterKind);
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
          chapterTitle: section.title,
          technicalPipeline: technical,
          highQualityThesis,
          allowedNatbibKeys,
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
            customCitationRules: citationRulesBlock,
          });
          diagnostics.repairTriggered = true;
          const fixed = await openAiThesisText(repairQ, qualityRepairMaxTok, {
            jobId,
            step: "drafting_chapters",
            label: `quality_repair_${chapterIndex}_${qPass}`,
          });
          if (!fixed) break;
          const fixedClean = stripMarkdownLatexArtifacts(sanitizeThesisLatexMath(fixed));
          if (scoreChapterQuality(fixedClean) >= scoreChapterQuality(combinedText)) {
            combinedText = fixedClean;
            diagnostics.generationMode = "repaired_output";
          }
          qualityIssues = auditChapterBody(combinedText, chapterKind, {
            chapterOrderIndex: chapterIndex,
            chapterTitle: section.title,
            technicalPipeline: technical,
            highQualityThesis,
            allowedNatbibKeys,
          });
          qPass += 1;
        }

        if (technical && chapterIndex < 2) {
          combinedText = stripDisplayedMathFromBody(combinedText);
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
      } catch (chapterErr) {
        try {
          await persistPartialThesisDraft(
            id,
            abstractLatex,
            drafts,
            papers.map((_, i) => `uploaded${i + 1}`),
          );
        } catch (persistErr) {
          console.error("[full-draft] partial persist failed", { jobId, persistErr });
        }
        await failJob({
          failedStep: "drafting_chapters",
          message: "Generation failed at: drafting_chapters",
          details: `Chapter ${chapterIndex + 1} (${section.title}): ${chapterErr instanceof Error ? chapterErr.message : String(chapterErr)}`,
          err: chapterErr,
          skippedSources: skippedAggregate,
        });
        return;
      }
    }

    await progress("generating_figures_tables", "generating_figures_tables", 78, skippedAggregate);
    try {
      ensureGlobalFigureMinimum(drafts, technical, { highQuality: technical });
      injectHighQualityFiguresAndTables(drafts, { technical });
      const enforced = enforceMandatoryThesisArtifacts(drafts);
      drafts.length = 0;
      drafts.push(...enforced);
    } catch (figErr) {
      console.error("[full-draft] figure/table injection", { jobId, err: figErr });
      if (drafts[0]) {
        drafts[0].content += `\\paragraph{Production note} Automated figure and table injection was skipped after an internal error; revise figures manually before export.`;
      }
      const enforced = enforceMandatoryThesisArtifacts(drafts);
      drafts.length = 0;
      drafts.push(...enforced);
    }

    await progress("inserting_citations", "inserting_citations", 82, skippedAggregate);

    for (let phRound = 0; phRound < 2; phRound++) {
      const combinedHits = auditCombinedThesisBodies({ abstractLatex, chapters: drafts });
      if (combinedHits.length === 0) break;

      const absHits = auditTextForPlaceholderLeaks(abstractLatex);
      if (absHits.length > 0) {
        diagnostics.repairTriggered = true;
        const repairedAbs = await openAiThesisText(
          buildAntiPlaceholderAbstractPrompt({ body: abstractLatex, hits: absHits }),
          qualityRepairMaxTok,
          { jobId, step: "inserting_citations", label: `anti_placeholder_abs_${phRound}` },
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
        diagnostics.repairTriggered = true;
        const repaired = await openAiThesisText(
          buildAntiPlaceholderChapterPrompt({
            chapterTitle: drafts[i].title,
            body: drafts[i].content,
            hits: chHits,
          }),
          qualityRepairMaxTok,
          { jobId, step: "inserting_citations", label: `anti_placeholder_ch_${i}_${phRound}` },
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

    if (technical) {
      for (let i = 0; i < Math.min(2, drafts.length); i++) {
        drafts[i].content = stripDisplayedMathFromBody(drafts[i].content);
      }
      abstractLatex = stripDisplayedMathFromBody(abstractLatex);
    }

    await progress("validating_quality", "validating_quality", 90, skippedAggregate);

    const logQualityDiagnostics = (label: string, extra?: Record<string, unknown>) => {
      const dx = buildFullDraftQualityDiagnostics({
        jobId,
        failedStep: null,
        abstractLatex,
        drafts,
      });
      console.log("[full-draft] quality_diagnostics", {
        label,
        jobId,
        projectId: id,
        totalSectionCountAcrossChapters: dx.totalSectionCountAcrossChapters,
        totalSubsectionCountAcrossChapters: dx.totalSubsectionCountAcrossChapters,
        combinedDocumentCharLength: dx.combinedDocumentCharLength,
        sectionCountsByChapter: dx.sectionCountsByChapter,
        subsectionCountsByChapter: dx.subsectionCountsByChapter,
        equationCountsByChapter: dx.equationCountsByChapter,
        tableCountsByChapter: dx.tableCountsByChapter,
        figureCountsByChapter: dx.figureCountsByChapter,
        first1000CharsByChapter: dx.first1000CharsByChapter.map((s) => s.slice(0, 200) + (s.length > 200 ? "…" : "")),
        ...extra,
      });
    };

    logQualityDiagnostics("before_quality_gate");

    let qualityWarningHits: { scope: string; code: string; detail: string }[] = [];
    const MAX_GATE_ROUNDS = 2;
    for (let gateRound = 0; gateRound < MAX_GATE_ROUNDS; gateRound++) {
      const gateHits = auditFullThesisQualityGate({
        abstractLatex,
        drafts,
        technicalPipeline: technical,
        highQualityThesis,
        allowedNatbibKeys,
      });
      qualityWarningHits = gateHits.filter((h) => classifyQualityGateHitSeverity(h) === "warning");
      const fatalGateHits = gateHits.filter((h) => classifyQualityGateHitSeverity(h) === "fatal");
      if (fatalGateHits.length === 0) break;

      logQualityDiagnostics(`quality_gate_round_${gateRound}`, {
        fatalGateHitCodes: fatalGateHits.map((h) => `${h.scope}:${h.code}`),
        warningGateHitCodes: qualityWarningHits.map((h) => `${h.scope}:${h.code}`),
      });

      const absIssues = fatalGateHits.filter((h) => h.scope === "abstract");
      if (absIssues.length > 0) {
        diagnostics.repairTriggered = true;
        const absRepair = await openAiThesisText(
          buildGateRepairAbstractPrompt({
            issues: absIssues,
            body: abstractLatex,
            citationRulesBlock,
          }),
          qualityRepairMaxTok,
          { jobId, step: "validating_quality", label: `gate_abs_${gateRound}` },
        );
        if (absRepair.trim()) {
          abstractLatex = sanitizeThesisLatexMath(absRepair);
          abstractLatex = stripMarkdownLatexArtifacts(abstractLatex);
          if (technical) abstractLatex = stripDisplayedMathFromBody(abstractLatex);
        }
      }

      for (let i = 0; i < drafts.length; i++) {
        const title = drafts[i].title;
        const chapterIssues = filterGateHitsForChapterRepair(fatalGateHits, title, drafts[i].content);
        if (chapterIssues.length === 0) continue;
        diagnostics.repairTriggered = true;
        const chRepair = await openAiThesisText(
          buildGateRepairChapterPrompt({
            chapterTitle: title,
            issues: chapterIssues,
            body: drafts[i].content,
            references: referenceSnippets,
            citationRulesBlock,
          }),
          qualityRepairMaxTok,
          { jobId, step: "validating_quality", label: `gate_ch_${i}_${gateRound}` },
        );
        if (chRepair.trim()) {
          drafts[i].content = sanitizeThesisLatexMath(chRepair);
          drafts[i].content = stripMarkdownLatexArtifacts(drafts[i].content);
          if (technical && i < 2) {
            drafts[i].content = stripDisplayedMathFromBody(drafts[i].content);
          }
        }
      }
    }

    const finalGateHits = auditFullThesisQualityGate({
      abstractLatex,
      drafts,
      technicalPipeline: technical,
      highQualityThesis,
      allowedNatbibKeys,
    });
    const finalFatalGateHits = finalGateHits.filter((h) => classifyQualityGateHitSeverity(h) === "fatal");
    qualityWarningHits = finalGateHits.filter((h) => classifyQualityGateHitSeverity(h) === "warning");
    if (finalFatalGateHits.length > 0) {
      const draftDiagnostics = buildFullDraftQualityDiagnostics({
        jobId,
        failedStep: "validating_quality",
        abstractLatex,
        drafts,
      });
      logQualityDiagnostics("after_quality_gate_failed", {
        finalFatalGateHitCodes: finalFatalGateHits.map((h) => `${h.scope}:${h.code}`),
        finalWarningGateHitCodes: qualityWarningHits.map((h) => `${h.scope}:${h.code}`),
      });
      await failJob({
        failedStep: "validating_quality",
        message: "Thesis did not pass final quality validation after automatic repair.",
        details: JSON.stringify({
          qualityFailureReport: finalFatalGateHits.map((h) => ({
            scope: h.scope,
            code: h.code,
            detail: h.detail,
          })),
          draftDiagnostics: {
            jobId: draftDiagnostics.jobId,
            failedStep: draftDiagnostics.failedStep,
            sectionCountsByChapter: draftDiagnostics.sectionCountsByChapter,
            subsectionCountsByChapter: draftDiagnostics.subsectionCountsByChapter,
            equationCountsByChapter: draftDiagnostics.equationCountsByChapter,
            tableCountsByChapter: draftDiagnostics.tableCountsByChapter,
            figureCountsByChapter: draftDiagnostics.figureCountsByChapter,
            first1000CharsByChapter: draftDiagnostics.first1000CharsByChapter,
            totalSectionCountAcrossChapters: draftDiagnostics.totalSectionCountAcrossChapters,
            totalSubsectionCountAcrossChapters: draftDiagnostics.totalSubsectionCountAcrossChapters,
            combinedDocumentCharLength: draftDiagnostics.combinedDocumentCharLength,
            combinedDocumentPreview2000: draftDiagnostics.combinedDocumentPreview2000,
            abstractPreview800: draftDiagnostics.abstractPreview800,
            chapters: draftDiagnostics.chapters.map((c) => ({
              title: c.title,
              kind: c.kind,
              sectionCount: c.sectionCount,
              subsectionCount: c.subsectionCount,
              displayMathBlockCount: c.displayMathBlockCount,
              tableCount: c.tableCount,
              figureCount: c.figureCount,
              wordCountApprox: c.wordCountApprox,
            })),
          },
        }),
        skippedSources: skippedAggregate,
      });
      return;
    }

    // Final guardrail: enforce mandatory appendix/subsections/table/figure after all repair rounds.
    {
      const enforced = enforceMandatoryThesisArtifacts(drafts);
      drafts.length = 0;
      drafts.push(...enforced);
    }

    await progress("assembling_document", "assembling_document", 95, skippedAggregate);

    const uploadFallbackKeys = papers.map((_, i) => `uploaded${i + 1}`);
    abstractLatex = sanitizeBlankCitationsInLatex(abstractLatex, { uploadFallbackKeys }).text;
    for (const d of drafts) {
      d.content = sanitizeBlankCitationsInLatex(d.content, { uploadFallbackKeys }).text;
    }

    try {
      await prisma.$transaction(async (tx) => {
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
    } catch (txErr) {
      await failJob({
        failedStep: "assembling_document",
        message: "Generation failed at: assembling_document",
        details: txErr instanceof Error ? txErr.message : String(txErr),
        err: txErr,
        skippedSources: skippedAggregate,
      });
      return;
    }

    await incrementUsage(jobRow.userId);
    await incrementThesisGenerationUsage(jobRow.userId);

    const qualityWarnings = qualityWarningHits.map((h) => `[${h.scope}] ${h.code}: ${h.detail}`);
    const finalFatalCount = finalFatalGateHits.length;
    diagnostics.selectedModel = llmTrace.selectedModel || diagnostics.selectedModel;
    diagnostics.fallbackModelUsed = Boolean(llmTrace.fallbackModelUsed);
    diagnostics.maxTokensObserved = llmTrace.maxTokensObserved || diagnostics.maxTokensObserved;
    if (diagnostics.repairTriggered && diagnostics.generationMode === "hq_one_shot_chapter") {
      diagnostics.generationMode = "repaired_output";
    }
    if (diagnostics.deterministicPlaceholderFallbackTriggered) {
      diagnostics.generationMode = "fallback_placeholder";
    }
    diagnostics.finalQualityScore = Math.max(0, 100 - finalFatalCount * 20 - qualityWarnings.length * 6);
    const diagnosticPayload = {
      generationDiagnostics: diagnostics,
      qualityWarnings,
    };
    const citationsInserted = countMatches(
      [abstractLatex, ...drafts.map((d) => d.content)].join("\n"),
      /\[(\d{1,3})\]|\\cite[tp]?\{/g,
    );
    console.log("[full-draft] final", {
      jobId,
      projectId: id,
      userId: jobRow.userId,
      inferredTitle,
      sourcesUsed: papers.length,
      citationsInserted,
      qualityGatePassed: qualityWarnings.length === 0,
      qualityWarnings,
      generationDiagnostics: diagnostics,
    });

    const successMessage = highQualityThesis
      ? "High-quality thesis draft generated (multi-pass blueprint, structure-first chapters, TikZ/pgfplots injection, sanitation, and audits). Review qualityWarnings if any; export PDF/LaTeX to compile."
      : "Thesis draft generated (multi-pass: abstract, structure-first per-chapter drafting, LaTeX sanitation, and quality repair where needed). Export PDF/LaTeX to compile.";

    await prisma.fullDraftJob.update({
      where: { id: jobId },
      data: {
        status: diagnostics.deterministicPlaceholderFallbackTriggered ? "partial_success" : "completed",
        progress: 100,
        lastStep: "completed",
        failedStep: null,
        message: successMessage,
        details: JSON.stringify(diagnosticPayload),
        resultSections: drafts.length,
        skippedSources: skippedAggregate as object,
      },
    });
  } catch (pipelineErr: unknown) {
    console.error("[full-draft] pipeline error", { jobId, pipelineErr });
    await failJob({
      failedStep: "unknown",
      message: "Generation failed during thesis pipeline",
      details: pipelineErr instanceof Error ? pipelineErr.message : String(pipelineErr),
      err: pipelineErr,
    });
  } finally {
    activeLlmTrace = null;
  }
}
