import { NextResponse } from "next/server";
import { after } from "next/server";
import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";
import { escapeLatex } from "@/lib/latex-escape";
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
  buildQualityRepairPrompt,
  countDisplayMathLines,
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
import { validateThesisUserInputs } from "@/lib/thesis-input-validation";
import { normalizeThesisTopicForGeneration } from "@/lib/thesis-topic-normalization";
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
  validateChapterStructureAgainstScaffold,
  wrapProseUnderScaffoldHeadings,
} from "@/lib/thesis-chapter-scaffold";
import {
  buildWorkspacePolicyInstructions,
  composeWorkspaceModelPrompt,
  extractResearchPromptFromLegacyComposedPrompt,
  THESIS_PIPELINE_FIXED_SETTINGS,
} from "@/lib/thesis-generation-settings";
import { sendThesisDraftCompleteEmail } from "@/lib/email";
import {
  extractResponsesOutputText,
  summarizeOpenAiResponseForLog,
  type OpenAiResponseUsage,
} from "@/lib/openai-response-text";
import {
  processChapterBodyFromModelRaw,
  stripResidualMarkdownLatexArtifacts,
  unwrapChapterLatexCandidate,
} from "@/lib/thesis-chapter-extract";
import { applyDeterministicThesisFinalization, isLikelyMethodologyChapterForPipeline } from "@/lib/thesis-draft-finalize";

/** Vercel / platform limit; `after()` continues work after the 202 response but still shares this ceiling. */
export const maxDuration = 300;

const bodySchema = z
  .object({
    prompt: z.string().min(8),
    /** Ignored for layout: thesis pipeline uses fixed workspace settings server-side. */
    generationSettings: z.unknown().optional(),
    /** Fast/low-token mode is opt-out only; default is full high-quality pipeline. */
    highQualityThesis: z.boolean().optional().default(true),
  })
  .passthrough();

const SECTION_MAX_OUTPUT_TOKENS = 3000;
const SECTION_MAX_OUTPUT_TOKENS_DEEP = 4200;
const ABSTRACT_MAX_OUTPUT_TOKENS = 900;
const QUALITY_REPAIR_MAX_TOKENS = 2800;
/** Total chars for reference excerpts in the thesis worker; must scale with many uploads or most sources are skipped. */
const MAX_REFERENCE_SNIPPET_CHARS = 96_000;
const MAX_SECTION_EXPANSION_PASSES = 2;
const MAX_STRUCTURE_REPAIR_PASSES = 2;
const MAX_ABSTRACT_EXPANSION_PASSES = 2;
const MAX_QUALITY_REPAIR_PASSES = 2;
/** Below this length, chapter output is treated as empty/unparseable — do not run heading structure validation. */
const MIN_CHAPTER_LATEX_CHARS = 500;
/** When unset, thesis drafting uses a single primary model (no automatic downgrade). Set SCHOLARFLOW_THESIS_ALLOW_FALLBACK=1 to retry with OPENAI_FALLBACK_MODEL. */
const THESIS_ALLOW_LLM_FALLBACK = process.env.SCHOLARFLOW_THESIS_ALLOW_FALLBACK === "1";

function parseThesisDraftTemperature(): number {
  const raw = process.env.SCHOLARFLOW_THESIS_TEMPERATURE;
  if (!raw?.trim()) return 0.48;
  const t = Number.parseFloat(raw);
  return Number.isFinite(t) ? Math.min(0.78, Math.max(0.05, t)) : 0.48;
}

const THESIS_DRAFT_TEMPERATURE = parseThesisDraftTemperature();
const THESIS_DRAFT_SEED = Number.parseInt(process.env.SCHOLARFLOW_THESIS_SEED || "", 10);
const THESIS_DRAFT_SEED_AVAILABLE = Number.isFinite(THESIS_DRAFT_SEED);

type GenerationMode = "hq_one_shot_chapter" | "subsection_slot_fill" | "repaired_output";

type LlmTrace = {
  selectedModel?: string;
  fallbackModelUsed?: boolean;
  /** Max `max_output_tokens` requested on any thesis LLM call in this job. */
  maxOutputTokensCap?: number;
  /** Usage from the most recent successful Responses API call (when provided). */
  lastUsage?: OpenAiResponseUsage;
  /** Largest `output_tokens` (or `total_tokens` when output missing) observed on any call. */
  peakOutputTokens?: number;
};

function flushLlmTraceToDiagnostics(d: RunDiagnostics, trace: LlmTrace) {
  d.selectedModel = trace.selectedModel || d.selectedModel;
  d.fallbackModelUsed = Boolean(trace.fallbackModelUsed);
  d.maxOutputTokensCap = trace.maxOutputTokensCap;
  d.lastOpenAiUsage = trace.lastUsage;
  const usageOut = trace.lastUsage?.output_tokens;
  const usageTotal = trace.lastUsage?.total_tokens;
  const fromUsage =
    typeof usageOut === "number" && usageOut > 0
      ? usageOut
      : typeof usageTotal === "number" && usageTotal > 0
        ? usageTotal
        : 0;
  d.maxTokensObserved = Math.max(
    d.maxTokensObserved,
    trace.peakOutputTokens ?? 0,
    fromUsage,
  );
}

type ThesisLlmCallMeta = {
  model: string;
  promptChars: number;
  maxOutputTokensRequested: number;
  rawOutputTextChars: number;
  rawPreview1000: string;
  extractedChars: number;
  extractedPreview1000: string;
  responseStatus?: string;
  incompleteReason?: string;
  refusalSummaries: string[];
  usage?: OpenAiResponseUsage;
  errorMessage?: string;
  usedReasoningFallback?: boolean;
  /** Production-only: when set, text came from emergency path after empty primary response. */
  productionFallbackPath?: "gpt4o_empty";
};

type RunDiagnostics = {
  jobId: string;
  inputHash: string;
  sourceCount: number;
  sourceHash: string;
  outlineHash: string;
  /** Logical pipeline id (LLM-authored chapters; not a deterministic template engine). */
  selectedPipelinePath: string;
  selectedModel: string;
  temperature: number;
  /**
   * Largest token counts from API usage (and similar) for this job.
   * Does not use requested `max_output_tokens` as a stand-in for model output.
   */
  maxTokensObserved: number;
  maxOutputTokensCap?: number;
  lastOpenAiUsage?: OpenAiResponseUsage;
  fallbackModelUsed: boolean;
  generationMode: GenerationMode;
  seedAvailable: boolean;
  seedValue?: number;
  oneShotUsed: boolean;
  slotFillUsed: boolean;
  repairTriggered: boolean;
  finalQualityScore: number;
  /** True when title/RQ/field were rewritten from sparse or noisy student inputs. */
  topicNormalized?: boolean;
  topicNormalizationWarnings?: string[];
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

/** LaTeX UX: avoid "/" in printed headings — prefer "and". */
function sanitizeSlashInHeadingTitle(title: string): string {
  return title.replace(/\s*\/\s*/g, " and ").trim();
}

/** Enforce no "/" in emitted LaTeX section-like headings. */
function sanitizeSlashInLatexHeadings(body: string): string {
  return body.replace(/\\(section|subsection|subsubsection)\*?\{([^}]*)\}/g, (_m, cmd: string, title: string) => {
    const cleaned = sanitizeSlashInHeadingTitle(String(title || ""));
    return `\\${cmd}{${cleaned}}`;
  });
}

/** Promote common inline heading labels into proper \subsection commands. */
function promoteInlineSubsectionLabels(body: string): string {
  const labels = [
    "Context and Motivation",
    "Research Question",
    "Structure of the Thesis",
    "Data and Sample",
    "Model Specification",
    "Main Results",
    "Robustness Checks",
    "Limitations",
  ];
  let out = body;
  for (const label of labels) {
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|\\n\\n)${esc}\\s+`, "g");
    out = out.replace(re, `$1\\\\subsection{${label}}\\n`);
  }
  return out;
}

function buildTopicCoherenceGuard(args: { title: string; researchQuestion: string; field: string }): string {
  const scope = `${args.title} ${args.researchQuestion} ${args.field}`.toLowerCase();
  const financeRelated = /(finance|asset pricing|stock|equity|portfolio|sharpe|return)/i.test(scope);
  if (financeRelated) return "";
  return `
Topic coherence guard:
- Stay strictly within the normalized thesis topic, research question, and domain.
- Do NOT switch domains (e.g., no finance/asset-pricing language) unless explicitly required by the topic.
- Forbidden drift terms for this thesis: "asset pricing", "stock returns", "equity returns", "Sharpe ratio", "firm-level characteristics", "portfolio".`.trim();
}

function normalizeSubsection(raw: unknown): OutlineSubsection | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const title = sanitizeSlashInHeadingTitle(String(item.title || "").trim());
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
  const title = sanitizeSlashInHeadingTitle(String(item.title || "").trim());
  if (!title) return null;
  const purpose = String(item.purpose || "").trim();
  const subsections = Array.isArray(item.subsections)
    ? item.subsections.map(normalizeSubsection).filter((v): v is OutlineSubsection => Boolean(v))
    : [];
  return { title, purpose: purpose || undefined, subsections };
}

function buildFallbackHierarchy(section: OutlineSection): OutlineSectionNode[] {
  const base = sanitizeSlashInHeadingTitle(section.title.trim()) || "Chapter";
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
        title: sanitizeSlashInHeadingTitle(String(json.title).trim()),
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

function buildNoDatasetGuidance(hasDataset: boolean): string {
  if (hasDataset) return "";
  return `
Data upload policy (no dedicated dataset file detected):
- Do not claim access to proprietary microdata you do not have.
- Still write a complete quantitative thesis: estimators, identifying assumptions, inference, threats to validity, and interpretation.
- You may use illustrative or literature-calibrated magnitudes when clearly framed (for example, stylised benchmarks or textbook orders of magnitude); avoid presenting them as observed project estimates.
`.trim();
}

function ensureMethodologyDisplayMathFloor(
  drafts: { title: string; content: string }[],
  minDisplayMathBlocks = 2,
) {
  for (const draft of drafts) {
    if (!isLikelyMethodologyChapterForPipeline(draft.title, draft.content)) continue;
    const existing = countDisplayMathLines(draft.content);
    if (existing >= minDisplayMathBlocks) return;
    const needed = minDisplayMathBlocks - existing;
    const mathBlocks = [
      String.raw`\begin{equation}
\widehat{y}_{i} = \beta_{0} + \beta_{1}x_{i} + \beta_{2}z_{i} + \varepsilon_{i}
\end{equation}`,
      String.raw`\begin{equation}
\mathcal{L}(\beta) = \sum_{i=1}^{n}\left(y_{i} - \widehat{y}_{i}\right)^{2}
\end{equation}`,
      String.raw`\begin{align}
E[\varepsilon_i \mid x_i, z_i] &= 0 \\
\operatorname{Var}(\varepsilon_i \mid x_i, z_i) &= \sigma^2
\end{align}`,
      String.raw`\begin{gather}
\operatorname{plim}_{n\to\infty} \widehat{\beta} = \beta + \operatorname{plim}_{n\to\infty}(X'X)^{-1}X'\varepsilon \\
\widehat{\operatorname{Var}}(\widehat{\beta}) = \widehat{\sigma}^{2}(X'X)^{-1}
\end{gather}`,
    ];
    const inject = mathBlocks.slice(0, Math.max(0, needed)).join("\n\n");
    if (!inject) return;
    draft.content = `${draft.content}\n\n\\subsection{Model Specification and Identification}\n\n${inject}\n`;
    return;
  }
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

  const withText = papers.filter((p) => p.extractedText?.trim());
  const n = withText.length;
  const effectiveBudget = Math.min(MAX_REFERENCE_SNIPPET_CHARS, 32_000 + Math.min(n, 50) * 2000);
  const reserve = 2500;
  const perPaperTarget = n > 0 ? Math.floor((effectiveBudget - reserve) / Math.min(n, 45)) : 0;
  const perPaperCap = Math.min(5200, Math.max(720, perPaperTarget - 72));

  for (const paper of papers) {
    const name = paper.originalName || "unnamed";
    if (!paper.extractedText?.trim()) {
      skippedSources.push({ filename: name, reason: "empty_or_missing_extracted_text" });
      continue;
    }
    const header = `\n\n### ${paper.originalName}\n`;
    const remaining = effectiveBudget - total - header.length;
    if (remaining < 200) {
      skippedSources.push({ filename: name, reason: "reference_context_budget_exceeded" });
      continue;
    }
    const snippet = paper.extractedText.slice(0, Math.min(perPaperCap, Math.max(120, remaining - 40)));
    const piece = `${header}${snippet}`;
    chunks.push(piece);
    total += piece.length;
    usedSourceCount += 1;
  }
  const snippets = chunks.join("\n");
  return { snippets, skippedSources, usedSourceCount, charEstimate: snippets.length };
}

const LLM_ATTEMPTS = 2;

/** Soft target (~30 pages prose); one expansion pass may run if the corpus is shorter. */
const CORPUS_WORD_SOFT_TARGET = 9300;

function countCorpusWordsApprox(abstractLatex: string, drafts: { content: string }[]): number {
  const w = (s: string) =>
    s
      .replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?(\{[^}]*\})?/g, " ")
      .replace(/[{}$\\]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
  return w(abstractLatex) + drafts.reduce((sum, d) => sum + w(d.content), 0);
}
let activeLlmTrace: LlmTrace | null = null;

function buildThesisLlmMeta(args: {
  model: string;
  prompt: string;
  maxOutputTokens: number;
  response: unknown;
  extracted: ReturnType<typeof extractResponsesOutputText>;
  err?: string;
}): ThesisLlmCallMeta {
  const r = args.response as { output_text?: string; status?: string };
  const rawTop = typeof r?.output_text === "string" ? r.output_text : "";
  const ex = args.extracted.text;
  return {
    model: args.model,
    promptChars: args.prompt.length,
    maxOutputTokensRequested: args.maxOutputTokens,
    rawOutputTextChars: args.extracted.preTrimSourceCharLength,
    rawPreview1000: args.extracted.rawTextPreview1000 || rawTop.slice(0, 1000),
    extractedChars: ex.length,
    extractedPreview1000: ex.slice(0, 1000),
    responseStatus: args.extracted.status ?? r?.status,
    incompleteReason: args.extracted.incompleteReason,
    refusalSummaries: args.extracted.refusalSummaries,
    usage: args.extracted.usage,
    errorMessage: args.err,
    usedReasoningFallback: args.extracted.usedReasoningFallback,
  };
}

/** Production-only: prepended to Responses API `input` so the model returns visible LaTeX, not empty/reasoning-only. */
const THESIS_PROD_PLAIN_PREFIX =
  "You must output the chapter content directly as LaTeX text. Do not return only reasoning, tool calls, JSON, or empty content.\n\n";

const THESIS_PROD_EMERGENCY_MODEL = "gpt-4o";
const THESIS_PROD_EMERGENCY_PROMPT_MAX = 12_000;

async function runProductionGpt4oEmptyFallback(
  basePrompt: string,
  maxOutputTokens: number,
  temperature: number,
  logCtx: { jobId?: string; step?: string; label?: string } | undefined,
  trace: LlmTrace | undefined,
): Promise<{ text: string; meta: ThesisLlmCallMeta } | null> {
  const body =
    basePrompt.length > THESIS_PROD_EMERGENCY_PROMPT_MAX
      ? `${THESIS_PROD_PLAIN_PREFIX}=== COMPRESSED TASK (last ${THESIS_PROD_EMERGENCY_PROMPT_MAX} chars) ===\n${basePrompt.slice(-THESIS_PROD_EMERGENCY_PROMPT_MAX)}`
      : `${THESIS_PROD_PLAIN_PREFIX}${basePrompt}`;

  const requestPayload: Record<string, unknown> = {
    model: THESIS_PROD_EMERGENCY_MODEL,
    input: body,
    max_output_tokens: maxOutputTokens,
    temperature,
  };
  if (THESIS_DRAFT_SEED_AVAILABLE) requestPayload.seed = THESIS_DRAFT_SEED;

  const response = await openai.responses.create(requestPayload as never);
  console.warn("[full-draft] production_gpt4o_empty_fallback_response", {
    jobId: logCtx?.jobId,
    step: logCtx?.step,
    label: logCtx?.label,
    ...summarizeOpenAiResponseForLog(response),
  });
  const extracted = extractResponsesOutputText(response);
  const meta: ThesisLlmCallMeta = {
    ...buildThesisLlmMeta({
      model: THESIS_PROD_EMERGENCY_MODEL,
      prompt: body,
      maxOutputTokens,
      response,
      extracted,
    }),
    productionFallbackPath: "gpt4o_empty",
  };

  if (trace) {
    trace.maxOutputTokensCap = Math.max(trace.maxOutputTokensCap ?? 0, maxOutputTokens);
    if (extracted.usage) {
      trace.lastUsage = extracted.usage;
      const ot = extracted.usage.output_tokens;
      const tt = extracted.usage.total_tokens;
      const peakCand =
        typeof ot === "number" && ot > 0 ? ot : typeof tt === "number" && tt > 0 ? tt : 0;
      if (peakCand > 0) {
        trace.peakOutputTokens = Math.max(trace.peakOutputTokens ?? 0, peakCand);
      }
    }
    if (extracted.text) {
      trace.selectedModel = THESIS_PROD_EMERGENCY_MODEL;
      trace.fallbackModelUsed = true;
    }
  }

  if (!extracted.text.trim()) return null;
  return { text: extracted.text, meta };
}

async function openAiThesisTextWithMeta(
  prompt: string,
  maxOutputTokens: number,
  logCtx?: { jobId?: string; step?: string; label?: string },
  trace?: LlmTrace,
  callOpts?: { temperature?: number },
): Promise<{ text: string; meta: ThesisLlmCallMeta }> {
  const isProd = process.env.NODE_ENV === "production";
  const runtimeTrace = trace ?? activeLlmTrace ?? undefined;
  const models = THESIS_ALLOW_LLM_FALLBACK ? [getModel(), getFallbackModel()] : [getModel()];
  let lastErr: unknown;
  const temperature =
    typeof callOpts?.temperature === "number" && Number.isFinite(callOpts.temperature)
      ? Math.min(0.65, Math.max(0, callOpts.temperature))
      : THESIS_DRAFT_TEMPERATURE;

  const apiInput = isProd ? `${THESIS_PROD_PLAIN_PREFIX}${prompt}` : prompt;

  const failMeta = (model: string, err?: string): ThesisLlmCallMeta => ({
    model,
    promptChars: prompt.length,
    maxOutputTokensRequested: maxOutputTokens,
    rawOutputTextChars: 0,
    rawPreview1000: "",
    extractedChars: 0,
    extractedPreview1000: "",
    refusalSummaries: [],
    errorMessage: err,
  });

  if (runtimeTrace) {
    runtimeTrace.maxOutputTokensCap = Math.max(runtimeTrace.maxOutputTokensCap ?? 0, maxOutputTokens);
  }

  for (const model of models) {
    for (let attempt = 1; attempt <= LLM_ATTEMPTS; attempt++) {
      try {
        const requestPayload: Record<string, unknown> = {
          model,
          input: apiInput,
          max_output_tokens: maxOutputTokens,
          temperature,
        };
        if (THESIS_DRAFT_SEED_AVAILABLE) requestPayload.seed = THESIS_DRAFT_SEED;
        const response = await openai.responses.create(requestPayload as never);
        if (isProd) {
          console.warn("[full-draft] openai_responses_shape", {
            jobId: logCtx?.jobId,
            step: logCtx?.step,
            label: logCtx?.label,
            model,
            attempt,
            ...summarizeOpenAiResponseForLog(response),
            response_json_char_estimate: JSON.stringify(response).length,
          });
        }
        const extracted = extractResponsesOutputText(response);
        const meta = buildThesisLlmMeta({ model, prompt, maxOutputTokens, response, extracted });

        if (runtimeTrace && extracted.usage) {
          runtimeTrace.lastUsage = extracted.usage;
          const ot = extracted.usage.output_tokens;
          const tt = extracted.usage.total_tokens;
          const peakCand =
            typeof ot === "number" && ot > 0 ? ot : typeof tt === "number" && tt > 0 ? tt : 0;
          if (peakCand > 0) {
            runtimeTrace.peakOutputTokens = Math.max(runtimeTrace.peakOutputTokens ?? 0, peakCand);
          }
        }
        if (runtimeTrace && extracted.text) {
          runtimeTrace.selectedModel = model;
          runtimeTrace.fallbackModelUsed = model === models[1];
        }

        if (extracted.refusalSummaries.length > 0) {
          console.warn("[full-draft] llm_refusal_or_empty_message", {
            jobId: logCtx?.jobId,
            step: logCtx?.step,
            label: logCtx?.label,
            model,
            refusalSummaries: extracted.refusalSummaries,
            status: extracted.status,
            incompleteReason: extracted.incompleteReason,
          });
        }

        if (extracted.text.trim()) {
          return { text: extracted.text, meta };
        }

        if (isProd && attempt === 1 && model === models[0]) {
          try {
            const emergency = await runProductionGpt4oEmptyFallback(
              prompt,
              maxOutputTokens,
              temperature,
              logCtx,
              runtimeTrace,
            );
            if (emergency?.text.trim()) {
              return emergency;
            }
          } catch (fallbackErr) {
            console.error("[full-draft] production_gpt4o_empty_fallback_failed", {
              jobId: logCtx?.jobId,
              step: logCtx?.step,
              label: logCtx?.label,
              message: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
            });
          }
        }

        if (attempt === LLM_ATTEMPTS) {
          return { text: extracted.text, meta };
        }
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
  return { text: "", meta: failMeta(models[0] ?? getModel(), lastErr instanceof Error ? lastErr.message : String(lastErr || "")) };
}

async function openAiThesisText(
  prompt: string,
  maxOutputTokens: number,
  logCtx?: { jobId?: string; step?: string; label?: string },
  trace?: LlmTrace,
  callOpts?: { temperature?: number },
): Promise<string> {
  return (await openAiThesisTextWithMeta(prompt, maxOutputTokens, logCtx, trace, callOpts)).text;
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
  workspacePolicy?: string;
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

${args.workspacePolicy?.trim() ? `${args.workspacePolicy.trim()}\n\n` : ""}${abstractMathPolicy}
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
  const noDatasetBlock = buildNoDatasetGuidance(Boolean(args.hasDataset));
  const topicCoherenceBlock = buildTopicCoherenceGuard({
    title: args.project.title,
    researchQuestion: args.project.researchQuestion,
    field: args.project.field,
  });

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
- Write at least ${args.minParagraphs} academic paragraphs in this fragment (minimum). Do not output scaffold notes or placeholder prose.
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
${topicCoherenceBlock}
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
  workspacePolicy?: string;
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
  const noDatasetBlock = buildNoDatasetGuidance(Boolean(args.hasDataset));
  const topicCoherenceBlock = buildTopicCoherenceGuard({
    title: args.project.title,
    researchQuestion: args.project.researchQuestion,
    field: args.project.field,
  });
  const openingTemplateEcho = args.mandatoryHeadingLines
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join("\n");

  return `
${args.strictPrefix}You are ThesisPilot drafting ONE COMPLETE chapter body in a single LLM pass (full chapter LaTeX).

VALIDATOR-ALIGNED CONSTRAINTS (JSON):
${args.constraintsJson}

OUTPUT FORMAT (non-negotiable):
- Your entire reply MUST be valid thesis LaTeX BODY only: start immediately with the first line of the mandatory heading template (typically \\section{...}), then each \\subsection{...} in order, each followed by paragraphs of prose.
- No Markdown code fences (\`\`\`). No JSON wrapper. No XML. No "Here is the chapter" preamble or postscript.
- No commentary outside LaTeX.

Your answer MUST begin with these exact opening lines (copy verbatim from the mandatory template; shown here for ordering — titles must match the template, not this example if they differ):
${openingTemplateEcho}

HARD RULES:
- No preamble and no \\chapter.
- Your first non-empty characters MUST be the first \\section{...} line from the mandatory template below (verbatim title).
- Use the exact heading template below once each (no extra \\section names, no heading renames).
- Fill substantive text under every required \\subsection.
- Target approximately ${args.targetWords} words for this chapter (document target ${args.targetPages} pages).
- Keep coherent narrative and transitions across subsections.

MANDATORY HEADING TEMPLATE (must appear exactly and in order — copy these lines verbatim as the opening of your answer):
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

${args.workspacePolicy?.trim() ? `${args.workspacePolicy.trim()}\n\n` : ""}${THESIS_DOCUMENT_SCHEMA}
${THESIS_FILLER_BAN}
${chapterGuidanceBlock}
${econBlock}
${mathRulesBlock}
${figureRulesBlock}
${blueprintBlock}
${noDatasetBlock}
${topicCoherenceBlock}
`.trim();
}

function buildExpansionPrompt(args: {
  section: OutlineSection;
  existingDraft: string;
  references: string;
  remainingWords: number;
  workspacePolicy?: string;
}) {
  return `
Expand the thesis section below with NEW material only.

Section title: ${args.section.title}
Approximate additional words required: ${args.remainingWords}

${args.workspacePolicy?.trim() ? `${args.workspacePolicy.trim()}\n\n` : ""}Rules:
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

/** Post-generation: do not inject fbox tables/figures or scaffold subsections — quality repair must obtain real floats from the model. */
function enforceMandatoryThesisArtifacts(drafts: { title: string; content: string }[]): { title: string; content: string }[] {
  return drafts.map((d) => ({ ...d }));
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
  workspacePolicy?: string;
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

${args.workspacePolicy?.trim() ? `${args.workspacePolicy.trim()}\n` : ""}
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

function stripMarkdownLatexArtifacts(
  input: string,
  opts?: { sliceChapterSection?: boolean },
): string {
  const { text } = unwrapChapterLatexCandidate(input, {
    sliceFromPrimarySection: opts?.sliceChapterSection ?? false,
  });
  const stripped = stripResidualMarkdownLatexArtifacts(text);
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

/** Production: no interactive transaction (fragile on Neon/serverless). Not used on localhost. */
const ASSEMBLY_CREATE_BATCH = 40;

async function persistAssembledDraftSectionsNonInteractive(opts: {
  projectId: string;
  jobId: string;
  sections: Array<{ projectId: string; title: string; sectionType: string; content: string }>;
}) {
  const { projectId, jobId, sections } = opts;

  await prisma.documentSection.deleteMany({
    where: { projectId, sectionType: "live_draft" },
  });
  await prisma.documentSection.deleteMany({
    where: { projectId, sectionType: "draft_chapter" },
  });
  await prisma.documentSection.deleteMany({
    where: { projectId, sectionType: "draft_abstract" },
  });

  try {
    await prisma.documentSection.createMany({
      data: sections,
      skipDuplicates: false,
    });
  } catch (firstErr) {
    console.error("[full-draft] assembling_document createMany failed, retrying in batches", {
      projectId,
      jobId,
      firstErr,
    });
    try {
      for (let i = 0; i < sections.length; i += ASSEMBLY_CREATE_BATCH) {
        const chunk = sections.slice(i, i + ASSEMBLY_CREATE_BATCH);
        await prisma.documentSection.createMany({
          data: chunk,
          skipDuplicates: false,
        });
      }
    } catch (batchErr) {
      console.error("[full-draft] assembling_document batched createMany failed", {
        projectId,
        jobId,
        batchErr,
      });
      throw batchErr;
    }
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { updatedAt: new Date() },
  });

  await prisma.fullDraftJob.update({
    where: { id: jobId },
    data: {
      lastStep: "assembling_document",
      progress: 96,
      message: "Saving thesis draft…",
    },
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

  const researchPrompt = extractResearchPromptFromLegacyComposedPrompt(payload.data.prompt);
  const composedModelPrompt = composeWorkspaceModelPrompt(researchPrompt, THESIS_PIPELINE_FIXED_SETTINGS);

  const promptTopic = researchPrompt.trim().replace(/[.?!]+$/, "");
  const promptWords = countPromptWords(promptTopic);

  const papers = await prisma.referencePaper.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
  });

  const topicNorm = normalizeThesisTopicForGeneration({
    title: project.title,
    field: project.field,
    researchQuestion: project.researchQuestion,
    description: project.description,
    userPrompt: researchPrompt,
    sourceCount: papers.length,
  });
  const inferredTitle = topicNorm.title;
  const inferredField = topicNorm.field;
  const inferredResearchQuestion = topicNorm.researchQuestion;

  const softInputNotes = validateThesisUserInputs({
    title: inferredTitle,
    field: inferredField,
    researchQuestion: inferredResearchQuestion,
    description: project.description,
    userPrompt: researchPrompt,
    sourceCount: papers.length,
  });
  if (topicNorm.topicWasNormalized) {
    console.log("[full-draft] topic normalized from weak input", {
      projectId: id,
      warnings: topicNorm.warnings,
    });
  }
  console.log("[full-draft] validation", {
    projectId: id,
    prompt: researchPrompt,
    inferredTitle,
    inferredField,
    inferredResearchQuestion,
    promptWords,
    sources: papers.length,
    topicWasNormalized: topicNorm.topicWasNormalized,
    softValidationNotes: softInputNotes.map((i) => i.code),
  });

  const highQualityThesis = detectHighQualityThesisMode({
    highQualityFlag: payload.data.highQualityThesis,
    prompt: composedModelPrompt,
  });

  const maxChars = getInputCharLimit();
  const maxWords = getInputWordLimit();
  const wordCount = countWords(researchPrompt);
  if (wordCount > maxWords) {
    return NextResponse.json(
      { error: `Prompt is too long. Limit is ${maxWords.toLocaleString()} words.` },
      { status: 400 },
    );
  }
  if (researchPrompt.length > maxChars) {
    return NextResponse.json(
      { error: `Prompt is too long. Limit is ${maxChars.toLocaleString()} characters.` },
      { status: 400 },
    );
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
    outlineSections = canonicalFiveChapterOutline();
    console.log("[full-draft] outline_fallback_canonical", { projectId: id });
  }

  const primaryModel = getModel();
  const fallbackModel = getFallbackModel();
  const jobRequestPayload = {
    prompt: payload.data.prompt,
    highQualityThesis: payload.data.highQualityThesis,
  };
  const job = await prisma.fullDraftJob.create({
    data: {
      projectId: id,
      userId: session.user.id,
      status: "queued",
      progress: 0,
      lastStep: "queued",
      requestPayload: jobRequestPayload,
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
    promptPreview: composedModelPrompt.slice(0, 500),
    highQualityThesis: detectHighQualityThesisMode({
      highQualityFlag: payload.data.highQualityThesis,
      prompt: composedModelPrompt,
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
  const llmTrace: LlmTrace = {};
  const diagnostics: RunDiagnostics = {
    jobId,
    inputHash: "",
    sourceCount: 0,
    sourceHash: "",
    outlineHash: "",
    selectedPipelinePath: "llm_chapter_one_shot",
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
    finalQualityScore: 0,
    topicNormalized: false,
    topicNormalizationWarnings: [],
  };

  const failJob = async (args: {
    failedStep: string;
    message: string;
    details?: string;
    err?: unknown;
    skippedSources?: SkippedSourceInfo[];
    /** Omit diagnostics/details/errorStack from DB so polling UI does not surface raw DB errors. */
    userSafePersistenceFailure?: boolean;
  }) => {
    flushLlmTraceToDiagnostics(diagnostics, llmTrace);
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
        details: args.userSafePersistenceFailure
          ? null
          : JSON.stringify({
              errorDetails: args.details ?? null,
              generationDiagnostics: diagnostics,
            }),
        errorStack: args.userSafePersistenceFailure ? null : stack,
        skippedSources: (args.skippedSources ?? skippedAggregate) as object | undefined,
      },
    });
  };

  const progress = async (
    status: string,
    lastStep: string,
    pct: number,
    skipped?: SkippedSourceInfo[],
    stepDetail?: string,
  ) => {
    if (skipped) skippedAggregate = skipped;
    await prisma.fullDraftJob.update({
      where: { id: jobId },
      data: {
        status,
        lastStep,
        progress: pct,
        ...(stepDetail ? { message: stepDetail } : {}),
        ...(skipped ? { skippedSources: skipped as object } : {}),
      },
    });
  };

  try {
    activeLlmTrace = llmTrace;
    await progress("loading_sources", "loading_sources", 6, undefined, "Loading project inputs and references");

    const researchPrompt = extractResearchPromptFromLegacyComposedPrompt(payload.data.prompt);
    let composedGlobalPrompt = composeWorkspaceModelPrompt(researchPrompt, THESIS_PIPELINE_FIXED_SETTINGS);
    const workspaceGenSettings = THESIS_PIPELINE_FIXED_SETTINGS;
    const workspacePolicy = buildWorkspacePolicyInstructions(workspaceGenSettings);
    const documentLanguageForPrompts = THESIS_PIPELINE_FIXED_SETTINGS.documentLanguage;

    const promptTopic = researchPrompt.trim().replace(/[.?!]+$/, "");
    const promptWords = countPromptWords(promptTopic);

    const papers = await prisma.referencePaper.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
    });

    const topicNorm = normalizeThesisTopicForGeneration({
      title: project.title,
      field: project.field,
      researchQuestion: project.researchQuestion,
      description: project.description,
      userPrompt: researchPrompt,
      sourceCount: papers.length,
    });
    const inferredTitle = topicNorm.title;
    const inferredField = topicNorm.field;
    const inferredResearchQuestion = topicNorm.researchQuestion;
    diagnostics.topicNormalized = topicNorm.topicWasNormalized;
    diagnostics.topicNormalizationWarnings = topicNorm.warnings;

    if (topicNorm.topicWasNormalized) {
      console.log("[full-draft] topic normalized from weak input", { jobId, warnings: topicNorm.warnings });
      composedGlobalPrompt +=
        `\n\n=== Internal topic framing (student inputs are guidance only; may be sparse) ===\n` +
        `Produce a coherent quantitative thesis aligned with:\n` +
        `- Working title: ${inferredTitle}\n` +
        `- Field: ${inferredField}\n` +
        `- Research question: ${inferredResearchQuestion}\n` +
        `Student prompt (non-binding): ${researchPrompt.trim() || "(none)"}\n`;
    }

    const highQualityThesis = detectHighQualityThesisMode({
      highQualityFlag: payload.data.highQualityThesis,
      prompt: composedGlobalPrompt,
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

    await progress(
      "extracting_sources",
      "extracting_sources",
      12,
      skippedSources,
      "Extracting and ranking source snippets for context window",
    );

    if (usedSourceCount === 0) {
      console.warn("[full-draft] no_extracted_reference_text_proceeding_with_prompt_only", {
        jobId,
        promptWords,
      });
    }

    await progress("planning_outline", "planning_outline", 15, undefined, "Validating and expanding chapter outline");

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
      outlineSections = canonicalFiveChapterOutline();
      console.warn("[full-draft] outline_fallback_canonical_in_worker", { jobId, projectId: id });
    }
    diagnostics.outlineHash = sha256(JSON.stringify(outlineSections));

    const targetPages = THESIS_PIPELINE_FIXED_SETTINGS.pages;
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
              workspacePolicy,
            }),
            HQ_BLUEPRINT_TOKENS,
            { jobId, step: "drafting_chapters", label: "thesis_blueprint" },
            llmTrace,
          )
        ).trim();
      }
    } catch (bpErr) {
      thesisBlueprint = "";
      diagnostics.repairTriggered = true;
      console.error("[full-draft] thesis_blueprint_skipped_after_error", {
        jobId,
        message: bpErr instanceof Error ? bpErr.message : String(bpErr),
      });
    }

    const abstractMaxTok = highQualityThesis ? HQ_ABSTRACT_TOKENS : ABSTRACT_MAX_OUTPUT_TOKENS;
    const qualityRepairMaxTok = highQualityThesis ? HQ_QUALITY_REPAIR_TOKENS : QUALITY_REPAIR_MAX_TOKENS;
    /** Speed-first: one generation + one local/LLM repair max; no multi-round chapter quality loops. */
    const maxQualityRepairPasses = 0;
    const maxSectionExpansionPasses = 1;
    const maxStructureRepairPasses = 1;
    const maxAbstractExpansionPasses = 1;
    const maxStrictStructureRepairPasses = 1;

    let abstractLatex: string;
    try {
      abstractLatex = sanitizeThesisLatexMath(
        await openAiThesisText(
          buildAbstractPrompt({
            project: {
              title: inferredTitle,
              field: inferredField,
              degreeLevel: project.degreeLevel,
              language: documentLanguageForPrompts,
              researchQuestion: inferredResearchQuestion,
              description: project.description,
            },
            globalPrompt: composedGlobalPrompt,
            references: referenceSnippets,
            technicalPipeline: technical,
            citationRulesBlock,
            workspacePolicy,
          }),
          abstractMaxTok,
          { jobId, step: "drafting_chapters", label: "abstract" },
          llmTrace,
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
            llmTrace,
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
      console.error("[full-draft] abstract_llm_failed_using_fallback", {
        jobId,
        message: absErr instanceof Error ? absErr.message : String(absErr),
      });
      abstractLatex = buildFallbackAbstractLatex({
        ...project,
        title: inferredTitle,
        field: inferredField,
        researchQuestion: inferredResearchQuestion,
      });
      if (technical) {
        abstractLatex = stripDisplayedMathFromBody(abstractLatex);
      }
      diagnostics.repairTriggered = true;
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
        `Drafting chapter ${chapterIndex + 1}/${totalChapters}: ${section.title}`,
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

        const MAX_CHAPTER_STRUCTURE_ATTEMPTS = 2;
        let combinedText = "";
        let lastStructMissing: string[] = [];
        const chapterAttemptReports: Record<string, unknown>[] = [];

        for (let structAttempt = 0; structAttempt < MAX_CHAPTER_STRUCTURE_ATTEMPTS; structAttempt++) {
          const strictPrefix =
            structAttempt === 0
              ? ""
              : `CRITICAL — STRUCTURE RETRY ${structAttempt + 1}/${MAX_CHAPTER_STRUCTURE_ATTEMPTS}: a previous assembly failed LaTeX heading validation (${lastStructMissing.join("; ") || "unknown"}).
Regenerate each subsection fragment so the assembled chapter contains EVERY required \\section and \\subsection from the constraints JSON, in order, with EXACT subsection titles.
DO NOT omit subsections. DO NOT rename headings. If evidence is thin, still write substantive, source-aware academic prose under every required heading (no template filler, no “replace this” stubs).\n\n`;
          let oneShotPrompt = buildChapterOneShotPrompt({
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
              language: documentLanguageForPrompts,
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
            workspacePolicy,
          });
          if (structAttempt >= 4) {
            oneShotPrompt += `

=== STRUCTURE LOCK (attempt ${structAttempt + 1}) ===
Your entire answer MUST begin with these lines, character-for-character (then continue with prose under each subsection):
${mandatoryHeadingLines}
`;
          }
          const attemptTemperature = THESIS_DRAFT_TEMPERATURE + Math.min(0.24, structAttempt * 0.034);
          const { text: rawChapterText, meta: chapterLlmMeta } = await openAiThesisTextWithMeta(
            oneShotPrompt,
            maxOut,
            {
              jobId,
              step: "drafting_chapters",
              label: `ch_${chapterIndex}_oneshot_a${structAttempt}`,
            },
            llmTrace,
            { temperature: attemptTemperature },
          );
          console.log("[full-draft] chapter_llm_raw_diagnostics", {
            jobId,
            chapterIndex,
            chapterTitle: section.title,
            structAttempt,
            model: chapterLlmMeta.model,
            promptChars: chapterLlmMeta.promptChars,
            maxOutputTokensRequested: chapterLlmMeta.maxOutputTokensRequested,
            rawOutputTextChars: chapterLlmMeta.rawOutputTextChars,
            rawPreview1000: chapterLlmMeta.rawPreview1000,
            extractedCharsBeforeSanitize: chapterLlmMeta.extractedChars,
            extractedPreview1000: chapterLlmMeta.extractedPreview1000,
            responseStatus: chapterLlmMeta.responseStatus,
            incompleteReason: chapterLlmMeta.incompleteReason,
            refusalSummaries: chapterLlmMeta.refusalSummaries,
            usage: chapterLlmMeta.usage,
            errorMessage: chapterLlmMeta.errorMessage,
            usedReasoningFallback: chapterLlmMeta.usedReasoningFallback,
            productionFallbackPath: chapterLlmMeta.productionFallbackPath,
            diagnosticNote:
              chapterLlmMeta.extractedChars === 0 && chapterLlmMeta.rawOutputTextChars === 0
                ? "OpenAI returned no final text"
                : undefined,
          });
          const { text: processedChapter, diagnostics: pipeDiag } = processChapterBodyFromModelRaw({
            rawFromApi: rawChapterText,
            chapterKind,
            citationOpts: { uploadFallbackKeys: allowedNatbibKeys },
            chapterOrderIndex: chapterIndex,
            chapterTitle: section.title,
            technicalPipeline: technical,
            highQualityThesis,
            allowedNatbibKeys,
          });
          combinedText = processedChapter.trim();

          const rawApiLen = rawChapterText.length;
          const extractedApiLen = chapterLlmMeta.extractedChars;
          let exactRejectionReason: string | undefined;
          if (combinedText.length < MIN_CHAPTER_LATEX_CHARS) {
            if (!rawChapterText.trim() && extractedApiLen === 0) {
              exactRejectionReason = "openai_returned_no_final_text";
            } else if (rawChapterText.trim().length > 0 && combinedText.length === 0) {
              exactRejectionReason = pipeDiag.emptiedAtStage
                ? `pipeline_zeroed_at_${pipeDiag.emptiedAtStage}`
                : pipeDiag.recoveryApplied
                  ? "pipeline_and_recovery_still_empty"
                  : "pipeline_zeroed_unknown_stage";
            } else {
              exactRejectionReason = `below_min_chars_after_pipeline_have_${combinedText.length}_need_${MIN_CHAPTER_LATEX_CHARS}`;
            }
          }

          const attemptReport = {
            structAttempt,
            exactRejectionReason,
            llm: {
              rawResponseChars: chapterLlmMeta.rawOutputTextChars,
              rawResponsePreview1000: chapterLlmMeta.rawPreview1000,
              extractedTextChars: chapterLlmMeta.extractedChars,
              extractedTextPreview1000: chapterLlmMeta.extractedPreview1000,
              usedReasoningFallback: chapterLlmMeta.usedReasoningFallback,
              diagnosticNote:
                chapterLlmMeta.extractedChars === 0 && chapterLlmMeta.rawOutputTextChars === 0
                  ? "OpenAI returned no final text"
                  : undefined,
              productionFallbackPath: chapterLlmMeta.productionFallbackPath,
            },
            stages: {
              rawApiChars: pipeDiag.rawApiChars,
              rawApiPreview1000: pipeDiag.rawApiPreview1000,
              afterUnwrapChars: pipeDiag.afterUnwrapChars,
              afterUnwrapPreview1000: pipeDiag.afterUnwrapPreview1000,
              afterResidualMarkdownChars: pipeDiag.afterResidualMarkdownChars,
              afterResidualMarkdownPreview1000: pipeDiag.afterResidualMarkdownPreview1000,
              afterLatexSanitizeChars: pipeDiag.afterLatexSanitizeChars,
              afterLatexSanitizePreview1000: pipeDiag.afterLatexSanitizePreview1000,
              afterCitationSanitizeChars: pipeDiag.afterCitationSanitizeChars,
              afterCitationSanitizePreview1000: pipeDiag.afterCitationSanitizePreview1000,
              afterPlaceholderAuditChars: pipeDiag.afterPlaceholderAuditChars,
              placeholderLeakHitCount: pipeDiag.placeholderLeakHitCount,
              placeholderLeakCodes: pipeDiag.placeholderLeakCodes,
              fillerAuditIssueCodes: pipeDiag.fillerAuditIssueCodes,
            },
            unwrapNotes: pipeDiag.unwrapNotes,
            emptiedAtStage: pipeDiag.emptiedAtStage,
            lastNonEmptyStage: pipeDiag.lastNonEmptyStage,
            lastNonEmptyLength: pipeDiag.lastNonEmptyLength,
            lastNonEmptyPreview1000: pipeDiag.lastNonEmptyPreview1000,
            recoveryApplied: pipeDiag.recoveryApplied,
            recoveryStrategy: pipeDiag.recoveryStrategy,
            finalProcessedChars: combinedText.length,
          };
          chapterAttemptReports.push(attemptReport);

          console.log("[full-draft] chapter_extract_pipeline", {
            jobId,
            chapterIndex,
            chapterTitle: section.title,
            ...attemptReport,
          });

          if (combinedText.length < MIN_CHAPTER_LATEX_CHARS) {
            lastStructMissing = [
              `extracted chapter LaTeX is ${combinedText.length} characters; require >= ${MIN_CHAPTER_LATEX_CHARS} before structure validation`,
            ];
            console.warn("[full-draft] chapter_extracted_too_short", {
              jobId,
              chapterIndex,
              structAttempt,
              sanitizedLength: combinedText.length,
              minRequired: MIN_CHAPTER_LATEX_CHARS,
              exactRejectionReason,
              rawApiLen,
              extractedApiLen,
            });
            continue;
          }
          const structCheck = validateChapterStructureAgainstScaffold(combinedText, adaptedScaffold);
          lastStructMissing = structCheck.missing;
          console.log("[full-draft] chapter_post_extract_diagnostics", {
            jobId,
            chapterIndex,
            chapterKind,
            chapterTitle: section.title,
            structAttempt,
            scaffoldOk: structCheck.ok,
            missing: structCheck.missing,
            sanitizedLength: combinedText.length,
            preview: combinedText.slice(0, 1000),
            tail: combinedText.slice(-800),
          });
          if (structCheck.ok) break;
        }

        if (combinedText.length < MIN_CHAPTER_LATEX_CHARS) {
          const tail = chapterAttemptReports[chapterAttemptReports.length - 1] as
            | {
                exactRejectionReason?: string;
                emptiedAtStage?: string;
                lastNonEmptyPreview1000?: string;
                llm?: { extractedTextPreview1000?: string; rawResponsePreview1000?: string };
              }
            | undefined;
          await failJob({
            failedStep: "drafting_chapters",
            message: "LLM returned empty or unparseable chapter content",
            details: JSON.stringify({
              chapterTitle: section.title,
              minChars: MIN_CHAPTER_LATEX_CHARS,
              finalLength: combinedText.length,
              attempts: MAX_CHAPTER_STRUCTURE_ATTEMPTS,
              exactRejectionReason: tail?.exactRejectionReason,
              attemptDiagnostics: chapterAttemptReports,
              preservedRawPreview1000: tail?.llm?.rawResponsePreview1000,
              preservedExtractedPreview1000: tail?.llm?.extractedTextPreview1000,
              preservedLastNonEmptyPreview1000: tail?.lastNonEmptyPreview1000,
              emptiedAtStage: tail?.emptiedAtStage,
            }),
            skippedSources: skippedAggregate,
          });
          return;
        }

        let structCheckFinal = validateChapterStructureAgainstScaffold(combinedText, adaptedScaffold);
        let afterStrictStructureRepairChars = combinedText.length;
        for (let structRepairRound = 0; structRepairRound < maxStrictStructureRepairPasses; structRepairRound++) {
          structCheckFinal = validateChapterStructureAgainstScaffold(combinedText, adaptedScaffold);
          if (structCheckFinal.ok) break;
          if (!combinedText.trim()) break;
          const brokenForRepair =
            combinedText.length > 36_000
              ? `${combinedText.slice(0, 18_000)}\n\n[… middle truncated for repair prompt …]\n\n${combinedText.slice(-18_000)}`
              : combinedText;
          const repairPrompt = buildStrictStructureRepairPrompt({
            missing: structCheckFinal.missing,
            referenceScaffold: renderScaffoldHeadingsOnlyLatex(adaptedScaffold),
            brokenBody: brokenForRepair,
            citationRulesBlock,
          });
          diagnostics.repairTriggered = true;
          const repairTemperature = THESIS_DRAFT_TEMPERATURE + Math.min(0.22, structRepairRound * 0.048);
          const repaired = await openAiThesisText(
            repairPrompt,
            maxOut,
            {
              jobId,
              step: "drafting_chapters",
              label: `strict_structure_repair_${chapterIndex}_r${structRepairRound}`,
            },
            llmTrace,
            { temperature: repairTemperature },
          );
          if (repaired.trim()) {
            const { text: repairedProcessed } = processChapterBodyFromModelRaw({
              rawFromApi: repaired,
              chapterKind,
              citationOpts: { uploadFallbackKeys: allowedNatbibKeys },
              chapterOrderIndex: chapterIndex,
              chapterTitle: section.title,
              technicalPipeline: technical,
              highQualityThesis,
              allowedNatbibKeys,
            });
            const repairedClean = repairedProcessed.trim();
            if (scoreChapterQuality(repairedClean) >= scoreChapterQuality(combinedText)) {
              combinedText = repairedClean;
              diagnostics.generationMode = "repaired_output";
            }
          }
          structCheckFinal = validateChapterStructureAgainstScaffold(combinedText, adaptedScaffold);
          afterStrictStructureRepairChars = combinedText.length;
          console.log("[full-draft] debug_raw_latex_post_strict_repair", {
            jobId,
            chapterIndex,
            round: structRepairRound,
            ok: structCheckFinal.ok,
            missing: structCheckFinal.missing,
            preview: combinedText.slice(0, 3500),
            afterStructureRepairChars: afterStrictStructureRepairChars,
          });
        }

        console.log("[full-draft] chapter_stage_after_strict_structure_repair", {
          jobId,
          chapterIndex,
          chapterTitle: section.title,
          afterStructureRepairChars: afterStrictStructureRepairChars,
          structureOk: structCheckFinal.ok,
        });

        if (!structCheckFinal.ok && combinedText.length >= MIN_CHAPTER_LATEX_CHARS) {
          const wrapped = wrapProseUnderScaffoldHeadings(combinedText, adaptedScaffold);
          if (wrapped) {
            const wClean = stripMarkdownLatexArtifacts(sanitizeThesisLatexMath(wrapped)).trim();
            if (wClean.length >= MIN_CHAPTER_LATEX_CHARS) {
              const wCheck = validateChapterStructureAgainstScaffold(wClean, adaptedScaffold);
              if (wCheck.ok) {
                combinedText = wClean;
                diagnostics.repairTriggered = true;
                diagnostics.generationMode = "repaired_output";
                structCheckFinal = wCheck;
                console.warn("[full-draft] chapter_structure_heading_wrap", {
                  jobId,
                  chapterIndex,
                  chapterTitle: section.title,
                });
              }
            }
          }
        }

        if (!structCheckFinal.ok) {
          diagnostics.repairTriggered = true;
          const salvageWrap = wrapProseUnderScaffoldHeadings(combinedText, adaptedScaffold);
          if (salvageWrap) {
            combinedText = stripMarkdownLatexArtifacts(sanitizeThesisLatexMath(salvageWrap)).trim();
          } else {
            const heads = renderScaffoldHeadingsOnlyLatex(adaptedScaffold);
            combinedText = `${heads}\n\n${combinedText.trim()}`;
          }
          structCheckFinal = validateChapterStructureAgainstScaffold(combinedText, adaptedScaffold);
          console.warn("[full-draft] chapter_structure_relaxed_accept", {
            jobId,
            chapterIndex,
            chapterTitle: section.title,
            structureOk: structCheckFinal.ok,
            missing: structCheckFinal.missing,
          });
        }

        combinedText = sanitizeThesisLatexMath(combinedText);
        let currentWords = countApproxWords(combinedText);
        let pass = 0;

        while (currentWords < targetWords * 0.95 && pass < maxSectionExpansionPasses) {
          const remainingWords = Math.max(220, Math.round(targetWords - currentWords));
          const expansionPrompt = buildExpansionPrompt({
            section,
            existingDraft: combinedText,
            references: referenceSnippets,
            remainingWords,
            workspacePolicy,
          });

          const extra = await openAiThesisText(expansionPrompt, maxOut, {
            jobId,
            step: "drafting_chapters",
            label: `chapter_expand_${chapterIndex}_${pass}`,
          }, llmTrace);
          if (!extra?.trim()) break;
          const { text: extraProcessed } = processChapterBodyFromModelRaw({
            rawFromApi: extra,
            chapterKind,
            citationOpts: { uploadFallbackKeys: allowedNatbibKeys },
            chapterOrderIndex: chapterIndex,
            chapterTitle: section.title,
            technicalPipeline: technical,
            highQualityThesis,
            allowedNatbibKeys,
          });
          if (!extraProcessed.trim()) break;
          combinedText = sanitizeThesisLatexMath(`${combinedText}\n\n${extraProcessed}`);
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
          const revised = await openAiThesisText(
            repairPrompt,
            maxOut,
            {
              jobId,
              step: "drafting_chapters",
              label: `structure_repair_${chapterIndex}_${structurePass}`,
            },
            llmTrace,
            { temperature: THESIS_DRAFT_TEMPERATURE + Math.min(0.18, structurePass * 0.045) },
          );
          if (!revised?.trim()) break;
          const { text: revisedProcessed } = processChapterBodyFromModelRaw({
            rawFromApi: revised,
            chapterKind,
            citationOpts: { uploadFallbackKeys: allowedNatbibKeys },
            chapterOrderIndex: chapterIndex,
            chapterTitle: section.title,
            technicalPipeline: technical,
            highQualityThesis,
            allowedNatbibKeys,
          });
          const revisedClean = revisedProcessed.trim();
          if (scoreChapterQuality(revisedClean) >= scoreChapterQuality(combinedText)) {
            combinedText = revisedClean;
            diagnostics.generationMode = "repaired_output";
          }
          hierarchyCheck = draftHasDenseHierarchy(combinedText, chapterKind);
          structurePass += 1;
        }

        console.log("[full-draft] chapter_stage_after_hierarchy_repair", {
          jobId,
          chapterIndex,
          chapterTitle: section.title,
          afterHierarchyRepairChars: combinedText.length,
          hierarchyOk: hierarchyCheck.isValid,
        });

        if (!hierarchyCheck.isValid) {
          console.warn("[full-draft] hierarchy_accepted_with_warnings", {
            jobId,
            chapterIndex,
            chapterTitle: section.title,
            hierarchyCheck,
          });
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
          }, llmTrace);
          if (!fixed?.trim()) break;
          const { text: fixedProcessed } = processChapterBodyFromModelRaw({
            rawFromApi: fixed,
            chapterKind,
            citationOpts: { uploadFallbackKeys: allowedNatbibKeys },
            chapterOrderIndex: chapterIndex,
            chapterTitle: section.title,
            technicalPipeline: technical,
            highQualityThesis,
            allowedNatbibKeys,
          });
          const fixedClean = fixedProcessed.trim();
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

        combinedText = promoteInlineSubsectionLabels(combinedText);
        combinedText = sanitizeSlashInLatexHeadings(combinedText);

        combinedText = appendFigurePlaceholdersForChapter(combinedText, {
          chapterOrderIndex: chapterIndex,
          chapterKind,
          technical,
          highQuality: technical,
        });

        console.log("[full-draft] chapter_final_accepted", {
          jobId,
          chapterIndex,
          chapterTitle: section.title,
          finalAcceptedChars: combinedText.length,
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

    if (countCorpusWordsApprox(abstractLatex, drafts) < CORPUS_WORD_SOFT_TARGET) {
      await progress(
        "drafting_chapters",
        "drafting_chapters",
        76,
        skippedAggregate,
        "Corpus length expansion (methodology and results; single pass)",
      );
      for (let ci = 0; ci < drafts.length; ci++) {
        if (countCorpusWordsApprox(abstractLatex, drafts) >= CORPUS_WORD_SOFT_TARGET) break;
        const kind = inferThesisChapterKind(drafts[ci].title);
        if (kind !== "methodology" && kind !== "results") continue;
        const section = scaledSections[ci];
        const remainingWords = Math.min(
          4200,
          Math.max(900, CORPUS_WORD_SOFT_TARGET - countCorpusWordsApprox(abstractLatex, drafts)),
        );
        const expansionPrompt = buildExpansionPrompt({
          section,
          existingDraft: drafts[ci].content,
          references: referenceSnippets,
          remainingWords,
          workspacePolicy,
        });
        const maxExpandTok =
          kind === "methodology" || kind === "results" ? SECTION_MAX_OUTPUT_TOKENS_DEEP : SECTION_MAX_OUTPUT_TOKENS;
        const extra = await openAiThesisText(
          expansionPrompt,
          maxExpandTok,
          { jobId, step: "drafting_chapters", label: `corpus_expand_${ci}` },
          llmTrace,
        );
        if (!extra?.trim()) continue;
        const { text: extraProcessed } = processChapterBodyFromModelRaw({
          rawFromApi: extra,
          chapterKind: kind,
          citationOpts: { uploadFallbackKeys: allowedNatbibKeys },
          chapterOrderIndex: ci,
          chapterTitle: section.title,
          technicalPipeline: technical,
          highQualityThesis,
          allowedNatbibKeys,
        });
        if (!extraProcessed.trim()) continue;
        drafts[ci].content = sanitizeThesisLatexMath(`${drafts[ci].content}\n\n${extraProcessed}`);
        drafts[ci].content = stripMarkdownLatexArtifacts(drafts[ci].content);
        if (technical && ci < 2) {
          drafts[ci].content = stripDisplayedMathFromBody(drafts[ci].content);
        }
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

    for (let phRound = 0; phRound < 1; phRound++) {
      const combinedHits = auditCombinedThesisBodies({ abstractLatex, chapters: drafts });
      if (combinedHits.length === 0) break;

      const absHits = auditTextForPlaceholderLeaks(abstractLatex);
      if (absHits.length > 0) {
        diagnostics.repairTriggered = true;
        const repairedAbs = await openAiThesisText(
          buildAntiPlaceholderAbstractPrompt({ body: abstractLatex, hits: absHits }),
          qualityRepairMaxTok,
          { jobId, step: "inserting_citations", label: `anti_placeholder_abs_${phRound}` },
          llmTrace,
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
          llmTrace,
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

    const methodologyMathFloor = highQualityThesis ? 4 : 2;
    ensureMethodologyDisplayMathFloor(drafts, methodologyMathFloor);
    await progress("validating_quality", "validating_quality", 90, skippedAggregate, "Running quality gate checks");

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

    let qualityWarningHits: { scope: string; code: string; detail: string }[] = auditFullThesisQualityGate({
      abstractLatex,
      drafts,
      technicalPipeline: technical,
      highQualityThesis,
      allowedNatbibKeys,
      topicContext: { title: project.title, researchQuestion: project.researchQuestion, field: project.field },
    });
    logQualityDiagnostics("quality_gate_diagnostic_only", {
      gateHitCodes: qualityWarningHits.map((h) => `${h.scope}:${h.code}`),
    });

    ensureMethodologyDisplayMathFloor(drafts, methodologyMathFloor);

    const finalGateHits = auditFullThesisQualityGate({
      abstractLatex,
      drafts,
      technicalPipeline: technical,
      highQualityThesis,
      allowedNatbibKeys,
      topicContext: { title: project.title, researchQuestion: project.researchQuestion, field: project.field },
    });
    qualityWarningHits = finalGateHits;
    logQualityDiagnostics("after_quality_gate_non_blocking", {
      remainingGateHitCodes: qualityWarningHits.map((h) => `${h.scope}:${h.code}`),
    });

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
      d.content = promoteInlineSubsectionLabels(d.content);
      d.content = sanitizeSlashInLatexHeadings(d.content);
    }

    {
      const finalized = applyDeterministicThesisFinalization({ abstractLatex, drafts });
      abstractLatex = finalized.abstractLatex;
      drafts.length = 0;
      drafts.push(...finalized.drafts);
    }

    const sectionRows: { projectId: string; title: string; sectionType: string; content: string }[] = [
      {
        projectId: id,
        title: "Generated abstract",
        sectionType: "draft_abstract",
        content: abstractLatex,
      },
      ...drafts.map((d) => ({
        projectId: id,
        title: d.title,
        sectionType: "draft_chapter",
        content: d.content,
      })),
    ];

    const persistAssembledDraftSections = async (tx: Prisma.TransactionClient) => {
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
    };

    const isProd = process.env.NODE_ENV === "production";

    try {
      if (isProd) {
        await persistAssembledDraftSectionsNonInteractive({
          projectId: id,
          jobId,
          sections: sectionRows,
        });
      } else {
        await prisma.$transaction(persistAssembledDraftSections);
      }
    } catch (txErr) {
      console.error("[full-draft] assembling_document persist failed", {
        jobId,
        projectId: id,
        err: txErr,
      });
      await failJob({
        failedStep: "assembling_document",
        message: "Generation completed, but saving the thesis failed. Please retry.",
        userSafePersistenceFailure: true,
        err: txErr,
        skippedSources: skippedAggregate,
      });
      return;
    }

    await incrementUsage(jobRow.userId);
    await incrementThesisGenerationUsage(jobRow.userId);

    const qualityWarnings = qualityWarningHits.map((h) => `[${h.scope}] ${h.code}: ${h.detail}`);
    flushLlmTraceToDiagnostics(diagnostics, llmTrace);
    if (diagnostics.repairTriggered && diagnostics.generationMode === "hq_one_shot_chapter") {
      diagnostics.generationMode = "repaired_output";
    }
    diagnostics.finalQualityScore = Math.max(0, 100 - qualityWarnings.length * 3);
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
      qualityGateNoteCount: qualityWarnings.length,
      qualityWarnings,
      generationDiagnostics: diagnostics,
    });

    const successMessage =
      "Full thesis draft saved. Review qualityWarnings for optional clean-up before PDF export; imperfect drafts are expected and do not block completion.";

    await prisma.fullDraftJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        progress: 100,
        lastStep: "completed",
        failedStep: null,
        message: successMessage,
        details: JSON.stringify(diagnosticPayload),
        resultSections: drafts.length,
        skippedSources: skippedAggregate as object,
      },
    });

    if (workspaceGenSettings?.notifyOnComplete) {
      const notifyUser = await prisma.user.findUnique({
        where: { id: jobRow.userId },
        select: { email: true },
      });
      if (notifyUser?.email) {
        void sendThesisDraftCompleteEmail(notifyUser.email, {
          projectTitle: inferredTitle,
          projectUrlPath: `/dashboard/projects/${id}`,
        });
      }
    }
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
