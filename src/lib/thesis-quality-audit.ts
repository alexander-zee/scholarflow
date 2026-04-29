import { inferThesisChapterKind, type ThesisChapterKind } from "@/lib/thesis-prompt-standards";
import { countFigureEnvironments } from "@/lib/thesis-latex-postprocess";
import { countTableEnvironments, countTikzOrPgfplotsFigures } from "@/lib/thesis-figures-tables";

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
  return null;
}

export function auditChapterBody(
  body: string,
  kind: ThesisChapterKind,
  context?: { chapterOrderIndex?: number; technicalPipeline?: boolean },
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

  if (sections < 3) {
    issues.push({ code: "sections_few", detail: `Only ${sections} \\section blocks; require at least 3.` });
  }
  if (flatWords > 900 && subsections < 4) {
    issues.push({ code: "subsections_shallow", detail: `Long chapter with only ${subsections} \\subsection blocks.` });
  }

  const longPara = longestParagraphApprox(body);
  if (longPara > 320) {
    issues.push({ code: "wall_of_text", detail: `A paragraph runs ~${longPara} words; split with headings or smaller paragraphs.` });
  }

  if (kind === "methodology") {
    const mathLines = countDisplayMathLines(body);
    if (mathLines < 4) {
      issues.push({
        code: "method_math_sparse",
        detail: `Methodology should include more displayed math (found ~${mathLines} display/equation blocks; target at least 4–5).`,
      });
    }
  }

  if (kind === "results") {
    const tables = countTableEnvironments(body);
    if (tables < 2) {
      issues.push({ code: "results_tables", detail: `Results should include at least 2 table environments (found ${tables}).` });
    }
    if (technical && countFigureEnvironments(body) < 2) {
      issues.push({
        code: "results_figures",
        detail: `Results should include at least 2 figure environments (found ${countFigureEnvironments(body)}).`,
      });
    }
  }

  if (kind === "methodology" && technical && countFigureEnvironments(body) < 1) {
    issues.push({
      code: "method_figures",
      detail: "Methodology should include at least one workflow or pipeline figure placeholder.",
    });
  }

  if (/author\?/i.test(body) || /\\cite[pt]?\s*\{\s*\}/.test(body)) {
    issues.push({ code: "citation_holes", detail: "Empty or question-mark citation placeholders detected." });
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
- Keep \\citep{citation_needed} where sources are unknown; never empty \\citep{}.
- Maintain academic tone; avoid generic filler.
- If early_display_math is listed: remove ALL displayed math from this chapter (\\[, equation/align/gather environments) and replace with narrative; move any formal statement to a \\textit{pointer} to Methodology/Appendix (no equations here).
${figureRepair}

Existing draft:
${args.existingDraft}

Reference excerpts:
${args.references}
`.trim();
}
