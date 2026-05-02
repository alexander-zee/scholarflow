import { escapeLatex } from "@/lib/latex-escape";
import { sanitizeThesisLatexMath } from "@/lib/latex-math-sanitize";
import { sanitizeBlankCitationsInLatex } from "@/lib/thesis-citation-sanitize";

function sanitizeHeadingSlash(title: string): string {
  return title.replace(/\s*\/\s*/g, " and ").trim();
}

/** True when content is already model-generated LaTeX (must not run through escapeLatex). */
export function looksLikeLatexBody(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (/^\\[a-zA-Z@]/.test(t)) return true;
  if (/\\(?:sub)*section\b/.test(s)) return true;
  if (/\\begin\{/.test(s)) return true;
  if (/\\(?:textbf|textit|emph|texttt|cite|parencite|footnote)\b/.test(s)) return true;
  if (/\\[\\$&#_%{}]/.test(s) && /\\[a-zA-Z@]{2,}/.test(s)) return true;
  return false;
}

/** Turn stored section body into LaTeX suitable for inclusion after \\chapter{...}. */
export function sectionContentToLatexBody(content: string): string {
  const t = content.trim();
  if (!t) return "\\textit{(empty section)}";
  if (looksLikeLatexBody(t)) return sanitizeBlankCitationsInLatex(t).text;
  const plain = t
    .split(/\n{2,}/g)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => escapeLatex(p))
    .join("\n\n");
  return sanitizeBlankCitationsInLatex(plain).text;
}

/** Conservative plain-text fallback when model LaTeX is malformed and fails compilation. */
function plainifyLatexLikeText(input: string): string {
  return input
    .replace(/\\texttt\{([^}]*)\}/g, "$1")
    .replace(/\\textbf\{([^}]*)\}/g, "$1")
    .replace(/\\textit\{([^}]*)\}/g, "$1")
    .replace(/\\emph\{([^}]*)\}/g, "$1")
    .replace(/\\paragraph\{\}\s*/g, "\n\n")
    .replace(/\\subsection\*?\{([^}]*)\}/g, "\n\n$1\n\n")
    .replace(/\\subsubsection\*?\{([^}]*)\}/g, "\n$1\n")
    .replace(/\\begin\{[^}]*\}[\s\S]*?\\end\{[^}]*\}/g, " ")
    .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?(\{[^}]*\})?/g, " ")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

export type ThesisLatexMeta = {
  title: string;
  field: string;
  degreeLevel: string;
  language: string;
  researchQuestion: string;
  description?: string | null;
  /** Logged-in user's display name (falls back handled by caller). */
  authorName: string;
  /** Uploaded reference filenames for the bibliography section. */
  uploadedSourceNames?: string[];
};

/** Collect \\citep{}/\\citet{} keys from draft LaTeX for placeholder bibitems. */
export function collectNatbibCiteKeysFromBodies(sections: { content: string }[]): string[] {
  const re = /\\(?:citep|citet|citealt|cite|citeauthor|citeyearpar)\{([^}]*)\}/g;
  const set = new Set<string>();
  for (const { content } of sections) {
    let m: RegExpExecArray | null;
    const copy = content;
    while ((m = re.exec(copy)) !== null) {
      for (const part of m[1].split(",")) {
        const key = part.trim();
        if (key.length > 0) set.add(key);
      }
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

function buildUploadedBibitems(names: string[]): string {
  if (!names.length) return "";
  return names
    .map((name, i) => {
      const key = `uploaded${i + 1}`;
      const label = escapeLatex(name);
      return `\\bibitem{${key}}\\textit{${label}}. Project-uploaded source; complete full bibliographic metadata before submission.`;
    })
    .join("\n\n");
}

/** BibTeX-style keys in \\bibitem must match \\citep{key}; only normalize unsafe characters. */
function bibKeyForLaTeX(k: string): string {
  return k.trim().replace(/[{}#%,\s&]/g, "_");
}

function buildCiteKeyPlaceholders(keys: string[]): string {
  if (!keys.length) return "";
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const k of keys) {
    let key = bibKeyForLaTeX(k) || "key";
    let n = 0;
    while (seen.has(key)) {
      n += 1;
      key = `${bibKeyForLaTeX(k) || "key"}_${n}`;
    }
    seen.add(key);
    const display = escapeLatex(k);
    lines.push(`\\bibitem{${key}}${display}. \\textit{Verify and complete this bibliographic entry before submission.}`);
  }
  return lines.join("\n\n");
}

/** `tectonic` = XeTeX bundle (ThesisPilot PDF path). `pdflatex` = classic pdfLaTeX preamble for MiKTeX/TeX Live. */
export type ThesisTexTarget = "pdflatex" | "tectonic";

/**
 * Full thesis-style LaTeX for download / pdflatex / Tectonic.
 * Chapters are `report` \\chapter entries; body is preserved when already LaTeX.
 */
function stripAbstractEnvironment(body: string): string {
  const t = body.trim();
  const m = t.match(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/i);
  if (m) return m[1].trim();
  return t;
}

export function buildThesisLatexDocument(
  meta: ThesisLatexMeta,
  sections: { title: string; content: string }[],
  target: ThesisTexTarget = "pdflatex",
  options?: { forcePlainBodies?: boolean; abstractLatex?: string | null; natbibPackageOptions?: string },
): string {
  const natbibOpts = options?.natbibPackageOptions?.trim() || "numbers,sort&compress";
  const generatedAbstract = options?.abstractLatex?.trim()
    ? stripAbstractEnvironment(options.abstractLatex)
    : "";
  const absFallback = [
    escapeLatex(meta.researchQuestion.trim()),
    meta.description?.trim() ? escapeLatex(meta.description.trim()) : "",
  ]
    .filter(Boolean)
    .join("\n\n\\medskip\n\n");

  const abstractForDoc = generatedAbstract
    ? options?.forcePlainBodies
      ? plainifyLatexLikeText(generatedAbstract)
          .split(/\n{2,}/g)
          .map((p) => p.trim())
          .filter(Boolean)
          .map((p) => escapeLatex(p))
          .join("\n\n")
      : sectionContentToLatexBody(sanitizeThesisLatexMath(generatedAbstract))
    : absFallback || "\\textit{Abstract pending final expansion in this draft build.}";

  const chapterBlocks = sections
    .map((section) => {
      const chTitle = escapeLatex(sanitizeHeadingSlash(section.title.trim() || "Chapter"));
      const rawBody = sanitizeThesisLatexMath(section.content);
      const body = options?.forcePlainBodies
        ? plainifyLatexLikeText(rawBody)
            .split(/\n{2,}/g)
            .map((p) => p.trim())
            .filter(Boolean)
            .map((p) => escapeLatex(p))
            .join("\n\n")
        : sectionContentToLatexBody(rawBody);
      return `\\chapter{${chTitle}}\n\n${body}`;
    })
    .join("\n\n");

  const citeKeys = collectNatbibCiteKeysFromBodies([
    ...sections,
    ...(generatedAbstract ? [{ content: generatedAbstract }] : []),
  ]);
  const uploadedNames = meta.uploadedSourceNames?.filter(Boolean) ?? [];
  const bibUploads = buildUploadedBibitems(uploadedNames);
  const bibCites = buildCiteKeyPlaceholders(citeKeys);
  const bibPieces = [bibUploads, bibCites].filter(Boolean).join("\n\n");
  const bibliographyBlock =
    bibPieces.trim().length > 0
      ? bibPieces
      : `\\bibitem{placeholder2026}ThesisPilot (2026). \\textit{Add references: connect uploads and citation keys to a full bibliography or .bib file.}`;

  const tikzBundle = `
\\usepackage{tikz}
\\usetikzlibrary{positioning,arrows.meta,shapes.misc}
\\usepackage{pgfplots}
\\pgfplotsset{compat=1.18}`.trim();

  const preamblePdflatex = `\\documentclass[12pt,a4paper,oneside]{report}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\usepackage[margin=2.5cm]{geometry}
\\usepackage{setspace}
\\usepackage{microtype}
\\usepackage{amsmath,amssymb}
\\usepackage{booktabs}
\\usepackage{graphicx}
\\usepackage{float}
\\usepackage[${natbibOpts}]{natbib}
\\usepackage{fancyhdr}
${tikzBundle}
\\usepackage[hidelinks]{hyperref}`;

  // Tectonic uses XeTeX: omit inputenc/fontenc (invalid / redundant). Omit microtype here (XeTeX support varies by bundle).
  const preambleTectonic = `\\documentclass[12pt,a4paper,oneside]{report}
\\usepackage[margin=2.5cm]{geometry}
\\usepackage{lmodern}
\\usepackage{setspace}
\\usepackage{amsmath,amssymb}
\\usepackage{booktabs}
\\usepackage{graphicx}
\\usepackage{float}
\\usepackage[${natbibOpts}]{natbib}
\\usepackage{fancyhdr}
${tikzBundle}
\\usepackage[hidelinks]{hyperref}`;

  const preamble = target === "tectonic" ? preambleTectonic : preamblePdflatex;

  return `% ThesisPilot thesis export — ${target === "tectonic" ? "compile with bundled Tectonic (XeTeX) or: tectonic main.tex" : "pdflatex (twice for TOC) or latexmk"}
% Replace bracketed placeholders before formal submission.
${preamble}
\\hypersetup{
  pdftitle={${escapeLatex(meta.title)}},
  pdfauthor={${escapeLatex(meta.authorName)}},
  colorlinks=true,
  linktoc=all,
  linkcolor=blue,
  citecolor=blue,
  urlcolor=blue,
}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[L]{\\small\\leftmark}
\\fancyhead[R]{\\small\\thepage}
\\fancyfoot{}
\\renewcommand{\\headrulewidth}{0.4pt}
\\onehalfspacing
\\setcounter{secnumdepth}{3}
\\setcounter{tocdepth}{3}

\\begin{document}

\\begin{titlepage}
  \\centering
  \\vspace*{2cm}
  {\\LARGE\\bfseries ${escapeLatex(meta.title)}\\par}
  \\vspace{1.2cm}
  {\\large \\textbf{${escapeLatex(meta.authorName)}}\\par}
  \\vspace{1.2cm}
  {\\large ${escapeLatex(meta.field)}\\par}
  \\vspace{0.5cm}
  {\\normalsize ${escapeLatex(meta.degreeLevel)} thesis / dissertation draft\\par}
  \\vfill
  {\\large \\textbf{[Institution --- replace]}\\par}
  \\vspace{1cm}
  {\\large \\today\\par}
\\end{titlepage}

\\pagenumbering{roman}
\\setcounter{page}{1}

\\chapter*{Abstract}
${abstractForDoc}

\\chapter*{Declaration}
This document was produced by \\textbf{${escapeLatex(meta.authorName)}} with ThesisPilot as \\emph{draft scaffolding}. The author is responsible for all claims, citations, data, and compliance with institutional academic integrity rules.

\\phantomsection
\\tableofcontents
\\clearpage
\\pagenumbering{arabic}
\\setcounter{page}{1}

${chapterBlocks}

\\cleardoublepage
\\chapter*{References}
\\phantomsection
\\addcontentsline{toc}{chapter}{References}
\\begin{thebibliography}{99}

${bibliographyBlock}

\\end{thebibliography}

\\end{document}
`;
}

/** Minimal article (legacy) when users want a short LaTeX file. */
export function buildSimpleArticleLatexDocument(title: string, sections: { title: string; content: string }[]): string {
  const body = sections
    .map((section) => {
      const sectionTitle = escapeLatex(sanitizeHeadingSlash(section.title));
      const inner = sectionContentToLatexBody(section.content);
      return `\\section{${sectionTitle}}\n${inner}\n`;
    })
    .join("\n");

  return `\\documentclass[12pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\usepackage[margin=1in]{geometry}
\\usepackage{setspace}
\\usepackage{hyperref}
\\onehalfspacing
\\setcounter{secnumdepth}{3}
\\setcounter{tocdepth}{3}

\\title{${escapeLatex(title)}}
\\author{ThesisPilot Draft}
\\date{\\today}

\\begin{document}
\\maketitle
\\tableofcontents
\\newpage

${body}

\\end{document}
`;
}
