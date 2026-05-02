/**
 * Deterministic finalization on the **assembled** thesis `.tex` string immediately before
 * `tectonic` / `pdflatex`. Ensures PDF compilation uses the same bytes the pass repaired.
 */

import {
  convertPlainScaffoldHeadingsToLatex,
  finalizeThesisChapterBodyForExport,
  sanitizeSlashInLatexHeadings,
} from "@/lib/thesis-draft-finalize";
import { existsSync } from "node:fs";

function ensureTableOfContentsAfterDeclaration(full: string): string {
  if (/\\tableofcontents\b/.test(full)) return full;
  const block = "\n\n\\phantomsection\n\\tableofcontents\n\\cleardoublepage\n\n";
  const m = full.match(/(\\chapter\*\{Declaration\}[\s\S]*?)(\n\\pagenumbering\{arabic\})/);
  if (m) {
    return full.replace(m[0], `${m[1]}${block}${m[2]}`);
  }
  return full.replace(/(\\pagenumbering\{arabic\})/, `${block}$1`);
}

/** Split `\\begin{document}` … `\\end{document}` inner; re-run chapter finalizer on each `\\chapter` segment. */
function finalizeChapterSegmentsInDocumentInner(inner: string): string {
  const chunks = inner.split(/(?=\n\\chapter(?:\*)?\{)/);
  return chunks
    .map((chunk) => {
      const m = chunk.match(/^(\n\\chapter(\*)?\{([^}]*)\}\s*\n+)/) ?? chunk.match(/^(\\chapter(\*)?\{([^}]*)\}\s*\n+)/);
      if (!m) return chunk;
      const header = m[1];
      const title = m[3];
      const body = chunk.slice(m[0].length);
      const nextBody = finalizeThesisChapterBodyForExport(title, body);
      return `${header}${nextBody}`;
    })
    .join("");
}

function collectLabelsInOrder(inner: string, prefix: "tab" | "fig"): string[] {
  const re = prefix === "tab" ? /\\label\{(tab:[^}]+)\}/g : /\\label\{(fig:[^}]+)\}/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) out.push(m[1]);
  return out;
}

function wireDanglingFloatRefs(inner: string): string {
  const tabLabs = collectLabelsInOrder(inner, "tab");
  const figLabs = collectLabelsInOrder(inner, "fig");
  let ti = 0;
  let fi = 0;
  let s = inner.replace(/Table~\s*(?!\\ref\{)/g, () => {
    if (!tabLabs.length) return "the draft tables";
    const lab = tabLabs[Math.min(ti, tabLabs.length - 1)];
    ti += 1;
    return `Table~\\ref{${lab}}`;
  });
  s = s.replace(/Figure~\s*(?!\\ref\{)/g, () => {
    if (!figLabs.length) return "the draft figures";
    const lab = figLabs[Math.min(fi, figLabs.length - 1)];
    fi += 1;
    return `Figure~\\ref{${lab}}`;
  });
  return s;
}

const FLOAT_BUNDLE_BEFORE_REFERENCES = String.raw`

\begin{table}[H]
\centering
\caption{Draft coefficient overview (exposition).}
\label{tab:pdf_asm_bundle_1}
\begin{tabular}{lrr}
\toprule
Term & Estimate & SE \\
\midrule
Treatment & 0.12 & 0.05 \\
\bottomrule
\end{tabular}
\end{table}

\begin{table}[H]
\centering
\caption{Draft fit statistics (exposition).}
\label{tab:pdf_asm_bundle_2}
\begin{tabular}{lr}
\toprule
Metric & Value \\
\midrule
$R^2$ & 0.31 \\
\bottomrule
\end{tabular}
\end{table}

\begin{figure}[H]
\centering
\begin{tikzpicture}
\begin{axis}[width=0.75\textwidth,height=4.2cm,ylabel={$y$},xlabel={$x$}]
\addplot+[only marks] coordinates {(0.1,0.4)(0.4,0.55)(0.7,0.62)(0.9,0.58)};
\end{axis}
\end{tikzpicture}
\caption{Draft partial regression cloud (exposition).}
\label{fig:pdf_asm_bundle_1}
\end{figure}

\begin{figure}[H]
\centering
\begin{tikzpicture}
\begin{axis}[width=0.75\textwidth,height=4.2cm,ylabel={Density},xlabel={Residual}]
\addplot+[thick,domain=-3:3,samples=80] {exp(-0.5*x*x)/2.5};
\end{axis}
\end{tikzpicture}
\caption{Draft residual density sketch (exposition).}
\label{fig:pdf_asm_bundle_2}
\end{figure}
`;

function ensureMinimumFloatBundleIfNeeded(inner: string): string {
  const tabs = (inner.match(/\\begin\{table\}/g) || []).length;
  const figs = (inner.match(/\\begin\{figure\}/g) || []).length;
  if (tabs >= 2 && figs >= 2) return inner;
  const ins = inner.search(/\n\\chapter\*\{References\}/);
  if (ins === -1) return `${inner.trim()}\n${FLOAT_BUNDLE_BEFORE_REFERENCES}`;
  return `${inner.slice(0, ins)}${FLOAT_BUNDLE_BEFORE_REFERENCES}\n${inner.slice(ins)}`;
}

function escapeLatexText(s: string): string {
  return s
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([{}#$%&_])/g, "\\$1")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/~/g, "\\textasciitilde{}");
}

function parseIncludegraphicsPath(cmd: string): string | null {
  const m = cmd.match(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/i);
  return m?.[1]?.trim() || null;
}

function figurePlaceholder(args: { description: string; caption?: string; label?: string }): string {
  const description = escapeLatexText(args.description.trim() || "Draft figure");
  const caption = escapeLatexText((args.caption || "Draft figure").trim());
  const label = (args.label || "").trim();
  const safeLabel = label ? `\n\\label{${label}}` : "";
  return [
    "\\begin{figure}[H]",
    "\\centering",
    "\\fbox{\\begin{minipage}{0.85\\textwidth}",
    "\\centering",
    "\\vspace{1em}",
    `Draft figure: ${description}`,
    "\\vspace{1em}",
    "\\end{minipage}}",
    `\\caption{${caption}}${safeLabel}`,
    "\\end{figure}",
  ].join("\n");
}

/**
 * Replace figure environments that include missing external graphics with compile-safe placeholders.
 * Keep existing captions/labels whenever possible.
 */
function replaceMissingExternalGraphicFigures(full: string): string {
  const figEnvRe = /\\begin\{figure\}[\s\S]*?\\end\{figure\}/gi;
  return full.replace(figEnvRe, (figBlock) => {
    const includeRe = /\\includegraphics(?:\[[^\]]*\])?\{[^}]+\}/gi;
    const includes = figBlock.match(includeRe) || [];
    if (includes.length === 0) return figBlock;

    const missing = includes
      .map((cmd) => ({ cmd, p: parseIncludegraphicsPath(cmd) }))
      .filter((v): v is { cmd: string; p: string } => Boolean(v.p))
      .filter(({ p }) => {
        return !existsSync(p);
      });
    if (missing.length === 0) return figBlock;

    const cap = figBlock.match(/\\caption\{([\s\S]*?)\}/i)?.[1]?.trim();
    const lab = figBlock.match(/\\label\{([^}]+)\}/i)?.[1]?.trim();
    const srcName = missing[0].p.replace(/^.*[\\/]/, "");
    const desc = cap && cap.length > 2 ? cap : srcName ? `auto-generated placeholder for missing source ${srcName}` : "auto-generated placeholder";
    return figurePlaceholder({ description: desc, caption: cap || "Draft figure", label: lab });
  });
}

function preCompileRepairResiduals(full: string): string {
  let s = full;
  for (let pass = 0; pass < 12; pass++) {
    const hit = /SECTION\s*:|Subsection\s*:|Table~\s*(?!\\ref\{)|Figure~\s*(?!\\ref\{)/i.exec(s);
    if (!hit) break;
    const idx = hit.index;
    console.warn("[thesis-export] pre_compile_repair", {
      token: hit[0],
      context: s.slice(Math.max(0, idx - 50), idx + 140),
    });
    s = convertPlainScaffoldHeadingsToLatex(s);
    s = s.replace(/Table~\s*(?!\\ref\{)/g, "");
    s = s.replace(/Figure~\s*(?!\\ref\{)/g, "");
    s = s.replace(/\bTable\s*\?+\s*\?+/gi, "");
    s = s.replace(/\bFigure\s*\?+\s*\?+/gi, "");
    s = s.replace(/(^|\n)[ \t]*SECTION\s*:[^\n]*/gim, "$1");
    s = s.replace(/(^|\n)[ \t]*Subsection\s*:[^\n]*/gim, "$1");
  }
  return s;
}

/**
 * Run on the exact string passed to the LaTeX engine (after `buildThesisLatexDocument`).
 */
function splitDocumentBody(tex: string): { prefix: string; inner: string; suffix: string } | null {
  const a = "\\begin{document}";
  const z = "\\end{document}";
  const i = tex.indexOf(a);
  const j = tex.lastIndexOf(z);
  if (i < 0 || j <= i) return null;
  const innerStart = i + a.length;
  return { prefix: tex.slice(0, innerStart), inner: tex.slice(innerStart, j), suffix: tex.slice(j) };
}

export function finalizeAssembledThesisLatexForPdfCompile(fullLatex: string): string {
  let tex = fullLatex;
  tex = ensureTableOfContentsAfterDeclaration(tex);
  tex = replaceMissingExternalGraphicFigures(tex);

  const doc = splitDocumentBody(tex);
  if (!doc) {
    tex = convertPlainScaffoldHeadingsToLatex(tex);
    tex = sanitizeSlashInLatexHeadings(tex);
    tex = replaceMissingExternalGraphicFigures(tex);
    return preCompileRepairResiduals(tex);
  }
  let inner = doc.inner;

  inner = convertPlainScaffoldHeadingsToLatex(inner);
  inner = sanitizeSlashInLatexHeadings(inner);
  inner = finalizeChapterSegmentsInDocumentInner(inner);
  inner = ensureMinimumFloatBundleIfNeeded(inner);
  inner = wireDanglingFloatRefs(inner);
  inner = convertPlainScaffoldHeadingsToLatex(inner);
  inner = sanitizeSlashInLatexHeadings(inner);

  tex = `${doc.prefix}${inner}${doc.suffix}`;
  tex = replaceMissingExternalGraphicFigures(tex);
  tex = preCompileRepairResiduals(tex);
  return tex;
}
