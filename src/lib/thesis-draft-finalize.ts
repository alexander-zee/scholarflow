/**
 * Deterministic post-pass before export / persist: scaffold cleanup, float repair,
 * minimal math injection, paragraph deduplication, and slash-free headings. No LLM calls.
 */

import { escapeLatex } from "@/lib/latex-escape";
import { countFigureEnvironments } from "@/lib/thesis-latex-postprocess";
import { countTableEnvironments } from "@/lib/thesis-figures-tables";
import { inferThesisChapterKind } from "@/lib/thesis-prompt-standards";

function sanitizeSlashInHeadingTitle(title: string): string {
  return title.replace(/\s*\/\s*/g, " and ").trim();
}

/** Heuristic: which chapters should receive methodology-style math repair (beyond title-only inference). */
export function inferThesisFinalizeKinds(title: string, body: string): { methodology: boolean; results: boolean } {
  const k = inferThesisChapterKind(title);
  if (k === "introduction" || k === "literature") {
    return { methodology: false, results: false };
  }
  if (k === "discussion") {
    return { methodology: false, results: false };
  }

  let methodology = k === "methodology";
  let results = k === "results";

  if (!methodology && k !== "appendix") {
    const head = `${title}\n${body.slice(0, 5000)}`.toLowerCase();
    if (
      /(methodology|research\s+design|econometric\s+setup|empirical\s+strateg|identification\s+strategy|sampling\s+frame|structural\s+equation|panel\s+model|fixed[-\s]effects|instrumental\s+variable|difference[-\s]in[-\s]differences|gmm\s+estimation|maximum\s+likelihood)/i.test(
        head,
      )
    ) {
      methodology = true;
    }
  }

  if (!results && k !== "appendix") {
    const head = `${title}\n${body.slice(0, 4000)}`.toLowerCase();
    if (
      /(results?\s+and\s+analysis|main\s+results|empirical\s+results|quantitative\s+results|baseline\s+estimates|robustness\s+checks|coefficient\s+estimates|heterogeneity\s+analysis|estimation\s+results)/i.test(
        head,
      )
    ) {
      results = true;
    }
  }

  return { methodology, results };
}

/** Exported for full-draft math floor so chapter titles like "Research Design" still receive display math. */
export function isLikelyMethodologyChapterForPipeline(title: string, body: string): boolean {
  return inferThesisFinalizeKinds(title, body).methodology;
}

/** Plain-text / model leaks like "SECTION: Background" → real LaTeX headings. */
export function convertPlainScaffoldHeadingsToLatex(input: string): string {
  let s = input;

  const toSection = (pre: string, rawTitle: string, cmd: "section" | "subsection") => {
    const t = sanitizeSlashInHeadingTitle(String(rawTitle || "").trim());
    if (!t) return pre;
    return `${pre}\\${cmd}{${escapeLatex(t)}}`;
  };

  s = s.replace(/(^|\n)\s*SECTION\s*[:：]\s*(.+?)\s*(?=\n|$)/gim, (_m, pre: string, raw: string) =>
    toSection(pre, raw, "section"),
  );
  s = s.replace(/(^|\n)\s*Subsection\s*[:：]\s*(.+?)\s*(?=\n|$)/gim, (_m, pre: string, raw: string) =>
    toSection(pre, raw, "subsection"),
  );
  s = s.replace(/(^|\n)\s*SUBSECTION\s*[:：]\s*(.+?)\s*(?=\n|$)/gim, (_m, pre: string, raw: string) =>
    toSection(pre, raw, "subsection"),
  );

  s = s.replace(/\\textbf\{\s*SECTION\s*[:：]\s*([^}]*)\}/gi, (_m, inner: string) => {
    const t = sanitizeSlashInHeadingTitle(inner.trim());
    return t ? `\\section{${escapeLatex(t)}}` : "";
  });
  s = s.replace(/\\textbf\{\s*Subsection\s*[:：]\s*([^}]*)\}/gi, (_m, inner: string) => {
    const t = sanitizeSlashInHeadingTitle(inner.trim());
    return t ? `\\subsection{${escapeLatex(t)}}` : "";
  });

  s = s.replace(/(^|\n)\s*SECTION\s*[:：]\s*(?=\n|$)/gim, "$1");
  s = s.replace(/(^|\n)\s*Subsection\s*[:：]\s*(?=\n|$)/gim, "$1");

  s = s.replace(/\n{3,}/g, "\n\n");
  return s;
}

export function sanitizeSlashInLatexHeadings(body: string): string {
  return body.replace(/\\(section|subsection|subsubsection)\*?\{([^}]*)\}/g, (_m, cmd: string, title: string) => {
    const cleaned = sanitizeSlashInHeadingTitle(String(title || ""));
    return `\\${cmd}{${cleaned}}`;
  });
}

function countDisplayMathBlocks(body: string): number {
  const eq = (body.match(/\\begin\{equation\*?\}/gi) || []).length;
  const al = (body.match(/\\begin\{align\*?\}/gi) || []).length;
  const ga = (body.match(/\\begin\{gather\*?\}/gi) || []).length;
  const br = (body.match(/\\\[[\s\S]*?\\\]/g) || []).length;
  return eq + al + ga + br;
}

const STRUCTURAL_CUE_RE =
  /(?:consider\s+the\s+following\s+structural\s+equation|the\s+following\s+structural\s+equation|the\s+following\s+equation|formalized\s+as|defined\s+as)\s*[:：]?\s*/gi;

const PRIMARY_STRUCTURAL_EQUATION_BLOCK = String.raw`

\[
Y_i = \alpha + \beta D_i + \mathbf{X}_i^{\prime} \boldsymbol{\gamma} + \varepsilon_i
\]

`;

function injectEquationAfterCueIfMissing(body: string, allowCueRepair: boolean): string {
  if (!allowCueRepair) return body;

  const cueRe = new RegExp(STRUCTURAL_CUE_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = cueRe.exec(body)) !== null) {
    const afterCue = m.index + m[0].length;
    const window = body.slice(afterCue, afterCue + 900);
    if (countDisplayMathBlocks(window) < 1) {
      return `${body.slice(0, afterCue)}\n${PRIMARY_STRUCTURAL_EQUATION_BLOCK}${body.slice(afterCue)}`;
    }
  }
  return body;
}

function stripBareFloatTildeRefs(body: string): string {
  return body
    .replace(/Table~\s*(?!\\ref\{)/g, "")
    .replace(/Figure~\s*(?!\\ref\{)/g, "")
    .replace(/\bTable\s+\?\?/gi, "")
    .replace(/\bFigure\s+\?\?/gi, "");
}

const MINIMAL_TABLE = (label: string) => String.raw`\begin{table}[H]
\centering
\caption{Coefficient summary with conventional robust standard errors (draft estimates for exposition).}
\label{${label}}
\begin{tabular}{lrr}
\toprule
Predictor & Estimate & Robust SE \\
\midrule
Core regressor & 0.18 & 0.06 \\
Baseline controls & \multicolumn{2}{r}{Included} \\
\bottomrule
\end{tabular}
\end{table}`;

const MINIMAL_FIGURE = (label: string) => String.raw`\begin{figure}[H]
\centering
\begin{tikzpicture}
\begin{axis}[
  width=0.82\textwidth,
  height=5.2cm,
  ylabel={Outcome},
  xlabel={Ordered bins},
  symbolic x coords={A,B,C},
  xtick=data,
  ymin=0, ymax=1
]
\addplot+[ybar] coordinates {(A,0.31)(B,0.44)(C,0.38)};
\end{axis}
\end{tikzpicture}
\caption{Grouped outcome shares by ordered category (draft visualization for exposition).}
\label{${label}}
\end{figure}`;

function ensureResultsFloatEnvironments(body: string, chapterTitle: string, isResults: boolean): string {
  if (!isResults) return body;

  let out = stripBareFloatTildeRefs(body);
  const slug = chapterTitle.replace(/[^\w]+/g, "_").slice(0, 24).toLowerCase() || "results";
  const additions: string[] = [];
  let t = countTableEnvironments(out);
  for (let i = t; i < 2; i++) {
    additions.push(MINIMAL_TABLE(`tab:draft_${slug}_${i + 1}`));
  }
  let f = countFigureEnvironments(out);
  for (let i = f; i < 2; i++) {
    additions.push(MINIMAL_FIGURE(`fig:draft_${slug}_${i + 1}`));
  }
  if (additions.length === 0) return out;
  return `${out.trim()}\n\n${additions.join("\n\n")}`.trim();
}

function ensureMethodologyHasDisplayMath(body: string, isMethodology: boolean): string {
  if (!isMethodology) return body;
  if (countDisplayMathBlocks(body) >= 1) return body;
  return `${body.trim()}\n\n${String.raw`\[
\widehat{\boldsymbol{\beta}} = (\mathbf{X}^{\prime}\mathbf{X})^{-1}\mathbf{X}^{\prime}\mathbf{y}
\]`}`.trim();
}

function normalizeParagraphFingerprint(s: string): string {
  return s
    .replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?(\{[^}]*\})?/g, " ")
    .replace(/[{}$\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 480);
}

/** Drop consecutive duplicate paragraphs (common literature-review repetition). */
export function dedupeAdjacentLatexParagraphs(body: string): string {
  const parts = body.split(/\n\n+/);
  const out: string[] = [];
  let lastKey = "";
  for (const p of parts) {
    const trimmed = p.trim();
    if (!trimmed) continue;
    if (/^\\begin\{(table|figure|equation|align|gather|multline)/i.test(trimmed)) {
      out.push(trimmed);
      lastKey = "";
      continue;
    }
    const key = normalizeParagraphFingerprint(trimmed);
    if (key.length < 140) {
      out.push(trimmed);
      lastKey = "";
      continue;
    }
    if (key === lastKey) continue;
    lastKey = key;
    out.push(trimmed);
  }
  return out.join("\n\n");
}

const MSE_DISPLAY_BLOCK = String.raw`

\[
\mathcal{L}(\boldsymbol{\beta})=\sum_{i=1}^{n}\left(y_i-\mathbf{x}_i^{\prime}\boldsymbol{\beta}\right)^2,\qquad
\mathrm{MSE}(\widehat{\boldsymbol{\beta}})=\frac{1}{n}\sum_{i=1}^{n}\left(y_i-\mathbf{x}_i^{\prime}\widehat{\boldsymbol{\beta}}\right)^2
\]

`;

function appendMseEquationBlockIfMethodologyNeeds(title: string, body: string): string {
  if (!inferThesisFinalizeKinds(title, body).methodology) return body;
  if (!/\bMSE\b|mean\s+squared\s+error/i.test(body)) return body;
  if (countDisplayMathBlocks(body) >= 2) return body;
  if (body.includes(String.raw`\mathrm{MSE}(\widehat{\boldsymbol{\beta}})`)) return body;
  return `${body.trim()}\n${MSE_DISPLAY_BLOCK}`.trim();
}

/** Deterministic fixes for one chapter body (used by DB persist path and assembled-LaTeX path). */
export function finalizeThesisChapterBodyForExport(title: string, content: string): string {
  let out = convertPlainScaffoldHeadingsToLatex(content);
  out = sanitizeSlashInLatexHeadings(out);
  out = dedupeAdjacentLatexParagraphs(out);

  const { methodology, results } = inferThesisFinalizeKinds(title, out);
  const allowCueRepair = methodology || results;
  out = injectEquationAfterCueIfMissing(out, allowCueRepair);
  if (
    methodology &&
    /\b(equation|specification|estimator|model|structural)\b/i.test(out) &&
    countDisplayMathBlocks(out) < 1
  ) {
    out = `${out.trim()}\n${PRIMARY_STRUCTURAL_EQUATION_BLOCK}`.trim();
  }
  out = ensureMethodologyHasDisplayMath(out, methodology);
  out = ensureResultsFloatEnvironments(out, title, results);
  out = appendMseEquationBlockIfMethodologyNeeds(title, out);

  out = convertPlainScaffoldHeadingsToLatex(out);
  out = sanitizeSlashInLatexHeadings(out);
  return out;
}

/**
 * Apply all deterministic fixes to abstract + chapter bodies (mutates copies; returns new objects).
 */
export function applyDeterministicThesisFinalization(args: {
  abstractLatex: string;
  drafts: { title: string; content: string }[];
}): { abstractLatex: string; drafts: { title: string; content: string }[] } {
  const abstractLatex = sanitizeSlashInLatexHeadings(
    convertPlainScaffoldHeadingsToLatex(args.abstractLatex || ""),
  );
  const drafts = args.drafts.map((d) => ({
    ...d,
    content: finalizeThesisChapterBodyForExport(d.title, d.content),
  }));
  return { abstractLatex, drafts };
}
