import { escapeLatex } from "@/lib/latex-escape";

export type DraftFormat = "latex" | "markdown";

/**
 * LaTeX.js resolves \\usepackage / \\geometry to dynamic imports ("Cannot find module 'unknown'" in Next/Turbopack).
 * Strip those lines for in-browser preview only; the user's saved source is unchanged elsewhere.
 */
export function sanitizeLatexForJsPreview(tex: string): string {
  return tex
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      if (t.startsWith("\\usepackage")) return false;
      if (t.startsWith("\\RequirePackage")) return false;
      if (t.startsWith("\\geometry")) return false;
      if (t.startsWith("\\hypersetup")) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{4,}/g, "\n\n\n");
}

export function inferDraftFormatFromContent(content: string): DraftFormat {
  const t = content.trimStart();
  if (t.startsWith("\\documentclass") || t.includes("\\begin{document}")) return "latex";
  if (t.startsWith("#") || /^#{1,6}\s/m.test(content)) return "markdown";
  return "latex";
}

export function chaptersLookLikeMarkdown(chapters: { content: string }[]): boolean {
  return chapters.some((c) => {
    const t = (c.content || "").trimStart();
    return t.startsWith("#") || /^#{1,6}\s/m.test(c.content || "");
  });
}

/** Legacy: markdown-style combined draft (existing projects). */
export function buildMarkdownPaperFromChapters(
  chapters: { title: string; content: string }[],
  heading: string,
): string {
  if (chapters.length === 0) return "";
  const parts = chapters.map((row) => {
    const body = (row.content || "").trim();
    const title = (row.title || "Section").trim();
    return `# ${title}\n\n${body}`;
  });
  return `${heading}\n\n${parts.join("\n\n\n")}`.trim();
}

/** New: full LaTeX document for the writing studio (preview via LaTeX.js). */
export function buildLatexPaperFromChapters(
  projectTitle: string,
  chapters: { title: string; content: string }[],
  note?: string,
): string {
  if (chapters.length === 0) return "";
  const intro = note
    ? `\\begin{center}\\small\\itshape ${escapeLatex(note)}\\end{center}\\vspace{0.75em}\n\n`
    : "";

  const blocks = chapters
    .map((row) => {
      const body = (row.content || "").trim();
      const title = (row.title || "Section").trim();
      return `\\section{${escapeLatex(title)}}\n\n${body}`;
    })
    .join("\n\n");

  // Preamble kept minimal: LaTeX.js loads \\usepackage{...} via dynamic imports that break in Next/browser bundles.
  // Stub natbib-like commands so thesis-style \\citep/\\citet from the model render in-browser (export uses real natbib).
  const citeStubs = `\\providecommand{\\citep}[1]{[\\emph{#1}]}
\\providecommand{\\citet}[1]{\\emph{#1}}
\\providecommand{\\citealt}[1]{\\emph{#1}}
\\providecommand{\\citeauthor}[1]{\\emph{#1}}
\\providecommand{\\citeyear}[1]{#1}
`;

  return `\\documentclass[11pt,a4paper]{article}
\\title{${escapeLatex(projectTitle)}}
\\date{}

\\begin{document}
\\maketitle
${citeStubs}
${intro}${blocks}
\\end{document}
`.trim();
}

export function buildLatexOutlinePlaceholder(projectTitle: string, outlineBlocks: string): string {
  return `\\documentclass[11pt,a4paper]{article}
\\title{${escapeLatex(projectTitle)}}
\\date{}
\\begin{document}
\\maketitle
\\begin{center}\\small\\itshape ${escapeLatex("No full draft yet — outline below. Generate a full draft from the project page, then return here.")}\\end{center}
\\vspace{0.75em}
${outlineBlocks}
\\end{document}
`.trim();
}
