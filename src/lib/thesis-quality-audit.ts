import { findBlankCitationHitsInText, latexHasBlankCitationCommands } from "@/lib/thesis-citation-sanitize";
import { inferThesisChapterKind, type ThesisChapterKind } from "@/lib/thesis-prompt-standards";
import { countFigureEnvironments } from "@/lib/thesis-latex-postprocess";
import { countTableEnvironments, countTikzOrPgfplotsFigures } from "@/lib/thesis-figures-tables";
import { auditTextForPlaceholderLeaks } from "@/lib/thesis-placeholder-audit";

function countApproxWordsPlain(text: string): number {
  const stripped = text
    .replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?(\{[^}]*\})?/g, " ")
    .replace(/[{}$\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped ? stripped.split(" ").length : 0;
}

function countMatches(input: string, re: RegExp) {
  return (input.match(re) || []).length;
}

export function countSectionDepth(body: string) {
  return {
    sections: countMatches(body, /\\section\*?\{[^}]+\}/g),
    subsections: countMatches(body, /\\subsection\*?\{[^}]+\}/g),
    subsubsections: countMatches(body, /\\subsubsection\*?\{[^}]+\}/g),
  };
}

export function countDisplayMathLines(body: string): number {
  const eq = countMatches(body, /\\begin\{equation\*?\}/gi);
  const brackets = countMatches(body, /\\\[[\s\S]*?\\\]/g);
  const align = countMatches(body, /\\begin\{align\*?\}/gi);
  const gather = countMatches(body, /\\begin\{gather\*?\}/gi);
  const multline = countMatches(body, /\\begin\{multline\*?\}/gi);
  return eq + brackets + align + gather + multline;
}

/** Corpus-level gate hits that can realistically be fixed by editing a single chapter body. */
const CORPUS_GATE_CODES_CHAPTER_SCOPED = new Set([
  "dangling_float_tilde",
  "placeholder_phrase",
  "cite_without_uploads",
]);

function corpusGateHitLikelyInChapterBody(code: string, body: string): boolean {
  switch (code) {
    case "dangling_float_tilde":
      return /(?:Figure|Table)~(?!\\ref\{)/m.test(body);
    case "placeholder_phrase":
      return /Placeholder\s*[—-]\s*complete|\[Placeholder/i.test(body);
    case "cite_without_uploads":
      return /\\cite[pt]?\{/i.test(body);
    default:
      return false;
  }
}

/**
 * Gate repair runs per-chapter. Only attach corpus hits that belong in this chapter's body
 * (avoids telling every chapter to add extra \\section blocks for document-wide totals).
 */
export function filterGateHitsForChapterRepair(
  gateHits: ThesisQualityGateHit[],
  chapterTitle: string,
  chapterBody: string,
): ThesisQualityGateHit[] {
  const out: ThesisQualityGateHit[] = [];
  for (const h of gateHits) {
    if (h.scope === chapterTitle) {
      out.push(h);
      continue;
    }
    if (h.scope === "corpus" && CORPUS_GATE_CODES_CHAPTER_SCOPED.has(h.code) && corpusGateHitLikelyInChapterBody(h.code, chapterBody)) {
      out.push(h);
    }
  }
  return out;
}

export type FullDraftChapterDiagnostics = {
  title: string;
  kind: ThesisChapterKind;
  sectionCount: number;
  subsectionCount: number;
  subsubsectionCount: number;
  displayMathBlockCount: number;
  tableCount: number;
  figureCount: number;
  wordCountApprox: number;
  first1000Chars: string;
};

export type FullDraftQualityDiagnostics = {
  jobId: string;
  failedStep: string | null;
  totalSectionCountAcrossChapters: number;
  totalSubsectionCountAcrossChapters: number;
  combinedDocumentCharLength: number;
  combinedDocumentPreview2000: string;
  abstractCharLength: number;
  abstractPreview800: string;
  sectionCountsByChapter: number[];
  subsectionCountsByChapter: number[];
  equationCountsByChapter: number[];
  tableCountsByChapter: number[];
  figureCountsByChapter: number[];
  first1000CharsByChapter: string[];
  chapters: FullDraftChapterDiagnostics[];
};

export function buildFullDraftQualityDiagnostics(args: {
  jobId: string;
  failedStep?: string | null;
  abstractLatex: string;
  drafts: { title: string; content: string }[];
}): FullDraftQualityDiagnostics {
  const chapters: FullDraftChapterDiagnostics[] = [];
  const sectionCountsByChapter: number[] = [];
  const subsectionCountsByChapter: number[] = [];
  const equationCountsByChapter: number[] = [];
  const tableCountsByChapter: number[] = [];
  const figureCountsByChapter: number[] = [];
  const first1000CharsByChapter: string[] = [];

  let totalSectionCountAcrossChapters = 0;
  let totalSubsectionCountAcrossChapters = 0;

  for (const d of args.drafts) {
    const kind = inferThesisChapterKind(d.title);
    const depth = countSectionDepth(d.content);
    const displayMathBlockCount = countDisplayMathLines(d.content);
    const tables = countTableEnvironments(d.content);
    const figures = countFigureEnvironments(d.content);
    const wordCountApprox = countApproxWordsPlain(d.content);
    const first1000Chars = d.content.slice(0, 1000);
    sectionCountsByChapter.push(depth.sections);
    subsectionCountsByChapter.push(depth.subsections);
    equationCountsByChapter.push(displayMathBlockCount);
    tableCountsByChapter.push(tables);
    figureCountsByChapter.push(figures);
    first1000CharsByChapter.push(first1000Chars);
    totalSectionCountAcrossChapters += depth.sections;
    totalSubsectionCountAcrossChapters += depth.subsections;
    chapters.push({
      title: d.title,
      kind,
      sectionCount: depth.sections,
      subsectionCount: depth.subsections,
      subsubsectionCount: depth.subsubsections,
      displayMathBlockCount,
      tableCount: tables,
      figureCount: figures,
      wordCountApprox,
      first1000Chars,
    });
  }

  const combined = args.drafts.map((d) => d.content).join("\n\n");

  return {
    jobId: args.jobId,
    failedStep: args.failedStep ?? null,
    totalSectionCountAcrossChapters,
    totalSubsectionCountAcrossChapters,
    combinedDocumentCharLength: combined.length,
    combinedDocumentPreview2000: combined.slice(0, 2000),
    abstractCharLength: args.abstractLatex.length,
    abstractPreview800: args.abstractLatex.slice(0, 800),
    sectionCountsByChapter,
    subsectionCountsByChapter,
    equationCountsByChapter,
    tableCountsByChapter,
    figureCountsByChapter,
    first1000CharsByChapter,
    chapters,
  };
}

export function longestParagraphApprox(body: string): number {
  const chunks = body.split(/\n{2,}/).map((c) => c.trim());
  let max = 0;
  for (const c of chunks) {
    if (/^\\(sub)*section/.test(c)) continue;
    const words = countApproxWordsPlain(c);
    if (words > max) max = words;
  }
  return max;
}

export type ThesisAuditIssue = { code: string; detail: string };

export function auditAbstractLatex(
  abstractBody: string,
  options?: { technicalPipeline?: boolean },
): ThesisAuditIssue | null {
  const words = countApproxWordsPlain(abstractBody);
  if (words < 150) {
    return { code: "abstract_short", detail: `Abstract is ~${words} words; require >= 150.` };
  }
  const lower = abstractBody.toLowerCase();
  if (/^\s*research question\s*$/im.test(abstractBody.trim()) || /^research question[.:]?\s*$/im.test(lower)) {
    return { code: "abstract_placeholder", detail: "Abstract looks like a placeholder heading only." };
  }
  if (options?.technicalPipeline && countDisplayMathLines(abstractBody) > 0) {
    return {
      code: "abstract_display_math",
      detail: "Abstract must not contain displayed equations for technical theses.",
    };
  }
  if (latexHasBlankCitationCommands(abstractBody)) {
    const hits = findBlankCitationHitsInText(abstractBody, "Abstract");
    const samples = hits.slice(0, 3).map((h) => `${h.match} @ ${h.context.slice(0, 300)}`);
    return { code: "blank_citation", detail: `Abstract contains empty citation command(s). ${samples.join(" | ")}` };
  }
  return null;
}

export function auditChapterBody(
  body: string,
  kind: ThesisChapterKind,
  context?: {
    chapterOrderIndex?: number;
    chapterTitle?: string;
    technicalPipeline?: boolean;
    highQualityThesis?: boolean;
    allowedNatbibKeys?: string[];
  },
): ThesisAuditIssue[] {
  const issues: ThesisAuditIssue[] = [];
  const { sections, subsections } = countSectionDepth(body);
  const flatWords = countApproxWordsPlain(body);
  const idx = context?.chapterOrderIndex ?? -1;
  const technical = Boolean(context?.technicalPipeline);
  const early = technical && idx >= 0 && idx < 2;

  if (early && countDisplayMathLines(body) > 0) {
    issues.push({
      code: "early_display_math",
      detail: "Displayed equations are not allowed in the first two thesis chapters (Introduction / Literature) for technical theses.",
    });
  }

  /**
   * One stored chapter = one outline chapter file. Normal structure is ONE \\section (chapter title)
   * plus several \\subsection blocks — not multiple \\section blocks inside the same chapter.
   */
  if (sections < 1) {
    issues.push({
      code: "sections_missing",
      detail: `Chapter body has no \\section heading (found ${sections}); each chapter should open with at least one \\section{...}.`,
    });
  }

  if (kind === "appendix") {
    if (flatWords > 400 && subsections < 3) {
      issues.push({
        code: "appendix_subsections",
        detail: `Appendix should include at least 3 \\subsection blocks when substantive (found ${subsections}).`,
      });
    }
  }

  const substantive = flatWords > 380;
  const minSubForKind = (() => {
    if (!substantive) return 0;
    if (kind === "discussion") return 2;
    return 3;
  })();
  if (minSubForKind > 0 && subsections < minSubForKind) {
    issues.push({
      code: "subsections_min",
      detail: `At least ${minSubForKind} \\subsection headings are required for this chapter archetype (found ${subsections}).`,
    });
  }
  if (flatWords > 3600 && subsections < 4) {
    issues.push({
      code: "subsections_shallow",
      detail: `Very long chapter (~${flatWords} words) with only ${subsections} \\subsection blocks; consider an additional \\subsection or \\subsubsection for readability.`,
    });
  }

  const longPara = longestParagraphApprox(body);
  if (longPara > 320) {
    issues.push({ code: "wall_of_text", detail: `A paragraph runs ~${longPara} words; split with headings or smaller paragraphs.` });
  }

  if (kind === "methodology") {
    const mathLines = countDisplayMathLines(body);
    const minMath = context?.highQualityThesis ? 4 : 2;
    if (mathLines < minMath) {
      issues.push({
        code: "method_math_sparse",
        detail: `Methodology should include displayed mathematics (found ~${mathLines} display/equation blocks; target at least ${minMath}).`,
      });
    }
  }

  if (kind === "results") {
    const tables = countTableEnvironments(body);
    const figs = countFigureEnvironments(body);
    const hq = Boolean(context?.highQualityThesis);
    const minTables = hq ? 2 : 1;
    const minFigs = hq ? 2 : 1;
    if (tables < minTables) {
      issues.push({
        code: "results_tables",
        detail: `Results must include at least ${minTables} table environment(s) with captions and labels (found ${tables}).`,
      });
    }
    if (figs < minFigs) {
      issues.push({
        code: "results_figures",
        detail: `Results must include at least ${minFigs} figure environment(s) with captions and labels (found ${figs}).`,
      });
    }
    const hasDescriptive = /\\subsection\*?\{[^}]*(desc|summary|explore|EDA|overview|distrib|statistic|preliminary)/i.test(
      body,
    );
    const hasModel = /\\subsection\*?\{[^}]*(model|estimation|regression|specification|baseline|econometric|empirical)/i.test(
      body,
    );
    const hasRobust = /\\subsection\*?\{[^}]*(robust|sensitivity|alternative|placebo|extension)/i.test(body);
    if (!(hasDescriptive && hasModel && hasRobust)) {
      issues.push({
        code: "results_subsection_themes",
        detail:
          "Results chapter must contain \\subsection blocks covering descriptive/summary evidence, model/estimation results, and robustness or sensitivity (adapt headings but keep all three themes).",
      });
    }
  }

  if (kind === "methodology" && technical && countFigureEnvironments(body) < 1) {
    issues.push({
      code: "method_figures",
      detail: "Methodology should include at least one workflow or pipeline figure placeholder.",
    });
  }

  if (kind === "appendix") {
    if (/replace\s+illustrative|synthetic\s+values|template\s+completeness/i.test(body)) {
      issues.push({
        code: "appendix_boilerplate",
        detail: "Appendix contains generic boilerplate about replacing illustrative or synthetic template text; replace with topic-specific supplementary content.",
      });
    }
  }

  if (/\\\(\s*\\\)/.test(body) || /\\\(\s*[a-zA-Z]{1,4}\s*:\s*\\\)/.test(body)) {
    issues.push({
      code: "malformed_inline_math",
      detail: "Degenerate inline math (empty \\( \\) or bare symbols with a colon) detected; remove or replace with valid LaTeX.",
    });
  }

  if (/author\?/i.test(body)) {
    issues.push({ code: "citation_holes", detail: "Question-mark citation placeholders (author?) detected." });
  }
  if (latexHasBlankCitationCommands(body)) {
    const label =
      context?.chapterTitle?.trim() ||
      (context?.chapterOrderIndex != null && context.chapterOrderIndex >= 0
        ? `Chapter ${context.chapterOrderIndex + 1}`
        : "chapter body");
    const hits = findBlankCitationHitsInText(body, label, context?.chapterOrderIndex);
    const samples = hits.slice(0, 4).map((h) => `${h.match} @ ${h.context.slice(0, 300)}`);
    issues.push({
      code: "blank_citation",
      detail: `Blank or empty citation command(s) in "${label}". ${samples.join(" || ")}`,
    });
  }

  if (/\\cite[pt]?\{citation_needed\}/i.test(body)) {
    issues.push({ code: "citation_needed_key", detail: "Remove \\citep{citation_needed}; cite uploaded sources using uploaded1…uploadedN keys only." });
  }

  const allowed = context?.allowedNatbibKeys;
  if (allowed && allowed.length > 0) {
    const allowedSet = new Set(allowed);
    const badKeys = new Set<string>();
    const re = /\\cite[pt]?\{([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      for (const part of m[1].split(",")) {
        const key = part.trim();
        if (!key || allowedSet.has(key)) continue;
        badKeys.add(key);
      }
    }
    if (badKeys.size > 0) {
      issues.push({
        code: "cite_key_not_allowed",
        detail: `Disallowed natbib key(s): ${[...badKeys].slice(0, 8).join(", ")}. Permitted keys only: ${[...allowedSet].join(", ")}.`,
      });
    }
  }

  return issues;
}

/** Aggregate checks across stored chapters (export-time / post-generation). */
export function auditAggregatedDraft(args: {
  drafts: { title: string; content: string }[];
  abstractLatex: string;
  technicalPipeline: boolean;
}): ThesisAuditIssue[] {
  const issues: ThesisAuditIssue[] = [];
  const abs = auditAbstractLatex(args.abstractLatex, { technicalPipeline: args.technicalPipeline });
  if (abs) issues.push(abs);

  const totalFigs = args.drafts.reduce((s, d) => s + countFigureEnvironments(d.content), 0);
  const totalTables = args.drafts.reduce((s, d) => s + countTableEnvironments(d.content), 0);

  if (args.technicalPipeline && totalFigs < 3) {
    issues.push({ code: "figures_global", detail: `Expected at least 3 figure placeholders across the thesis (found ${totalFigs}).` });
  }
  if (args.technicalPipeline && totalTables < 2) {
    issues.push({ code: "tables_global", detail: `Expected at least 2 tables across the thesis (found ${totalTables}).` });
  }

  if (args.technicalPipeline) {
    for (let i = 0; i < Math.min(2, args.drafts.length); i++) {
      const d = args.drafts[i];
      for (const issue of auditChapterBody(d.content, inferThesisChapterKind(d.title), {
        chapterOrderIndex: i,
        technicalPipeline: true,
      })) {
        if (issue.code === "early_display_math") issues.push(issue);
      }
    }
  }

  if (/ThesisPilot notice/i.test(args.drafts.map((d) => d.content).join("\n"))) {
    issues.push({ code: "notice_leak", detail: "Chapter bodies should not contain ThesisPilot notice text." });
  }

  return issues;
}

/** Duplicate \\section titles within one chapter body (case-insensitive). */
export function findDuplicateSectionTitlesInBody(body: string): string[] {
  const re = /\\section\*?\{([^}]+)\}/g;
  const titles: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    titles.push(m[1].trim().toLowerCase());
  }
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const t of titles) {
    if (seen.has(t)) dups.add(t);
    seen.add(t);
  }
  return [...dups];
}

/**
 * Strict export gate for technical theses that already contain several TikZ figures (high-quality pipeline output).
 */
export function auditHighQualityFinalGate(args: {
  abstractLatex: string;
  drafts: { title: string; content: string }[];
  technicalPipeline: boolean;
}): ThesisAuditIssue[] {
  const issues: ThesisAuditIssue[] = [];
  if (!args.technicalPipeline) return issues;

  const bodies = args.drafts.map((d) => d.content).join("\n\n");
  const tikz = countTikzOrPgfplotsFigures(bodies);
  const tables = args.drafts.reduce((s, d) => s + countTableEnvironments(d.content), 0);

  if (tikz < 5) {
    issues.push({
      code: "hq_min_tikz",
      detail: `High-quality technical thesis expects at least five TikZ/pgfplots picture blocks (found ${tikz}).`,
    });
  }
  if (tables < 3) {
    issues.push({
      code: "hq_min_tables",
      detail: `High-quality technical thesis expects at least three table environments (found ${tables}).`,
    });
  }

  const methIdx = args.drafts.findIndex((d) => inferThesisChapterKind(d.title) === "methodology");
  const preMethodologyIndices =
    methIdx >= 0
      ? [...Array(methIdx).keys()]
      : [...Array(Math.min(2, args.drafts.length)).keys()];
  for (const i of preMethodologyIndices) {
    const d = args.drafts[i];
    if (countDisplayMathLines(d.content) > 0) {
      issues.push({
        code: "hq_math_before_methodology",
        detail: `Displayed mathematics must not appear before the Methodology chapter (offending chapter "${d.title}", order ${i + 1}).`,
      });
      break;
    }
  }
  if (args.technicalPipeline && countDisplayMathLines(args.abstractLatex) > 0) {
    issues.push({ code: "hq_abstract_display_math", detail: "Abstract must not contain displayed equations." });
  }

  for (const d of args.drafts) {
    const dups = findDuplicateSectionTitlesInBody(d.content);
    if (dups.length) {
      issues.push({
        code: "hq_duplicate_sections",
        detail: `Duplicate \\section titles in "${d.title}": ${dups.slice(0, 6).join(", ")}${dups.length > 6 ? "…" : ""}`,
      });
    }
  }

  if (/ThesisPilot notice/i.test(bodies) || /ThesisPilot notice/i.test(args.abstractLatex)) {
    issues.push({ code: "hq_notice_leak", detail: "Remove ThesisPilot notice text from thesis bodies." });
  }

  return issues;
}

export function buildQualityRepairPrompt(args: {
  chapterTitle: string;
  kind: ThesisChapterKind;
  issues: ThesisAuditIssue[];
  existingDraft: string;
  references: string;
  /** When true, do not instruct the model to add fbox placeholder figures. */
  highQualityMode?: boolean;
  /** Upload-only citation rules repeated for repair passes. */
  customCitationRules?: string;
}): string {
  const figureRepair = args.highQualityMode
    ? "- If results_figures or method_figures: add compile-safe TikZ/pgfplots inside \\begin{figure}[H] with real \\caption and \\label, or describe plots in prose (no fbox placeholders)."
    : "- If results_figures or method_figures: add compile-safe \\begin{figure}[H] placeholders with \\caption and \\label as in the figure-placeholder specification.";

  return `
You are revising a thesis chapter draft to satisfy automated quality checks.

Chapter: ${args.chapterTitle}
Archetype: ${args.kind}

Issues to fix (address each explicitly):
${args.issues.map((i) => `- [${i.code}] ${i.detail}`).join("\n")}

Rules:
- Return valid LaTeX body only (no preamble, no \\chapter for the chapter title).
- Preserve correct economics/math notation with braced subscripts (e.g. m_{t+1}, R_{i,t+1}).
- Never use \\citep{citation_needed}; follow the upload-only citation instructions below when present.
- If blank_citation is listed: remove every empty \\cite{} / \\citep{} / \\citet{} / \\parencite{} / \\textcite{} / \\autocite{}; replace with plain [citation needed] or a valid \\citep{uploadedN} from the allowed list only.
${args.customCitationRules?.trim() ? `\n${args.customCitationRules.trim()}\n` : ""}
- Maintain academic tone; avoid generic filler.
- If early_display_math is listed: remove ALL displayed math from this chapter (\\[, equation/align/gather environments) and replace with narrative; move any formal statement to a \\textit{pointer} to Methodology/Appendix (no equations here).
- Chapter file model: keep ONE primary \\section for this outline chapter when possible; satisfy subsection/figure/table/math issues by adding or expanding \\subsection blocks (and \\subsubsection), not by splitting into multiple unrelated \\section blocks unless the issue text explicitly requires it.
${figureRepair}

Existing draft:
${args.existingDraft}

Reference excerpts:
${args.references}
`.trim();
}

export type ThesisQualityGateHit = { scope: string; code: string; detail: string };
export type ThesisQualityGateSeverity = "fatal" | "warning";

const FATAL_QUALITY_GATE_CODES = new Set<string>([
  "sections_missing",
  "subsections_min",
  "document_sections_total",
  "early_display_math",
  "method_math_sparse",
  "results_tables",
  "results_figures",
  "results_subsection_themes",
  "appendix_missing",
]);

export function classifyQualityGateHitSeverity(hit: ThesisQualityGateHit): ThesisQualityGateSeverity {
  return FATAL_QUALITY_GATE_CODES.has(hit.code) ? "fatal" : "warning";
}

export function auditFullThesisQualityGate(args: {
  abstractLatex: string;
  drafts: { title: string; content: string }[];
  technicalPipeline: boolean;
  highQualityThesis: boolean;
  allowedNatbibKeys: string[];
}): ThesisQualityGateHit[] {
  const hits: ThesisQualityGateHit[] = [];
  const absPh = auditTextForPlaceholderLeaks(args.abstractLatex);
  for (const p of absPh) hits.push({ scope: "abstract", code: p.code, detail: p.message });

  const absIssues = auditAbstractLatex(args.abstractLatex, { technicalPipeline: args.technicalPipeline });
  if (absIssues) hits.push({ scope: "abstract", code: absIssues.code, detail: absIssues.detail });

  const combined = args.drafts.map((d) => d.content).join("\n\n");
  const totalSectionsAcrossChapters = args.drafts.reduce((sum, d) => sum + countSectionDepth(d.content).sections, 0);
  if (totalSectionsAcrossChapters < 5) {
    hits.push({
      scope: "corpus",
      code: "document_sections_total",
      detail: `Full thesis should contain at least 5 \\section headings across all chapter bodies (found ${totalSectionsAcrossChapters}). Add or restore outline chapters, or ensure each chapter body includes its opening \\section.`,
    });
  }

  const allText = combined + "\n" + args.abstractLatex;
  if (!args.allowedNatbibKeys.length && /\\cite[pt]?\{/i.test(allText)) {
    hits.push({
      scope: "corpus",
      code: "cite_without_uploads",
      detail: "This project has no indexed uploads; remove \\citep/\\citet commands and use narrative attribution instead.",
    });
  }
  if (/Placeholder\s*[—-]\s*complete|\[Placeholder/i.test(allText)) {
    hits.push({
      scope: "corpus",
      code: "placeholder_phrase",
      detail: "Bibliographic placeholder phrasing detected in thesis bodies.",
    });
  }
  if (/(?:Figure|Table)~(?!\\ref\{)/m.test(combined + args.abstractLatex)) {
    hits.push({
      scope: "corpus",
      code: "dangling_float_tilde",
      detail: "Bare Figure~ or Table~ without \\ref{...} detected.",
    });
  }

  for (let di = 0; di < args.drafts.length; di++) {
    const d = args.drafts[di];
    const kind = inferThesisChapterKind(d.title);
    const chapterIssues = auditChapterBody(d.content, kind, {
      chapterOrderIndex: di,
      chapterTitle: d.title,
      technicalPipeline: args.technicalPipeline,
      highQualityThesis: args.highQualityThesis,
      allowedNatbibKeys: args.allowedNatbibKeys,
    });
    for (const issue of chapterIssues) {
      hits.push({ scope: d.title, code: issue.code, detail: issue.detail });
    }
    for (const p of auditTextForPlaceholderLeaks(d.content)) {
      hits.push({ scope: d.title, code: p.code, detail: p.message });
    }
  }

  const appendixPresent = args.drafts.some((d) => inferThesisChapterKind(d.title) === "appendix");
  if (!appendixPresent) {
    hits.push({
      scope: "corpus",
      code: "appendix_missing",
      detail: "Thesis must include an Appendix chapter with supplementary materials.",
    });
  }

  const hqIssues =
    args.technicalPipeline && args.highQualityThesis
      ? auditHighQualityFinalGate({
          abstractLatex: args.abstractLatex,
          drafts: args.drafts,
          technicalPipeline: args.technicalPipeline,
        })
      : [];
  for (const issue of hqIssues) {
    hits.push({ scope: "corpus", code: issue.code, detail: issue.detail });
  }

  return hits;
}

export function buildGateRepairAbstractPrompt(args: {
  issues: ThesisQualityGateHit[];
  body: string;
  citationRulesBlock: string;
}): string {
  return `
Rewrite the thesis Abstract as valid LaTeX body only (no \\chapter, no preamble).

Fix every issue below. Preserve substantive claims; improve structure, math hygiene, and citations.

Issues:
${args.issues.map((i) => `- [${i.code}] (${i.scope}) ${i.detail}`).join("\n")}

Citation policy:
${args.citationRulesBlock}

Current abstract:
${args.body}
`.trim();
}

export function buildGateRepairChapterPrompt(args: {
  chapterTitle: string;
  issues: ThesisQualityGateHit[];
  body: string;
  references: string;
  citationRulesBlock: string;
}): string {
  return `
Revise the thesis chapter below to satisfy ALL automated quality gate issues.

Chapter: ${args.chapterTitle}

Issues (fix each — return full chapter LaTeX body only, no preamble, no \\chapter for the chapter title):
${args.issues.map((i) => `- [${i.code}] (${i.scope}) ${i.detail}`).join("\n")}

Citation policy:
${args.citationRulesBlock}

Rules:
- Normal thesis structure: one stored chapter = one opening \\section (chapter theme) plus several \\subsection blocks. Fix missing depth by adding \\subsection / \\subsubsection, not by inventing extra top-level \\section blocks unless strictly necessary.
- Enforce the minimum \\subsection counts implied by the issues (typically 3 for Introduction/Literature/Methodology/Results, 2–3 for Discussion).
- Results chapters must include booktabs tables and figure environments with \\caption, \\label, and in-text references using Figure~\\\\ref{...} / Table~\\\\ref{...}.
- Remove degenerate inline math such as empty \\( \\) or "f:" fragments; use valid braced notation.
- Never invent AuthorYear cite keys; use uploaded keys only when sources exist.
- Never leave empty citation commands (\\cite{}, \\citep{}, etc.); use [citation needed] in plain text if no key is valid.

Reference excerpts:
${args.references}

Current chapter LaTeX:
${args.body}
`.trim();
}
