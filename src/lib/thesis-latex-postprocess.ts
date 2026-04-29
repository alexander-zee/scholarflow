import { escapeLatex } from "@/lib/latex-escape";
import { inferThesisChapterKind, type ThesisChapterKind } from "@/lib/thesis-prompt-standards";

export function countFigureEnvironments(body: string): number {
  return (body.match(/\\begin\{figure\}/g) || []).length;
}

const REMOVED_MATH_NOTE =
  "\\textit{[Displayed mathematics was deferred to the Methodology chapter or Appendix to match thesis conventions.]}";

/** Remove displayed math environments (first two chapters + abstract for technical theses). */
export function stripDisplayedMathFromBody(input: string): string {
  let s = input;
  const repl = `\n\n${REMOVED_MATH_NOTE}\n\n`;
  s = s.replace(/\\\[[\s\S]*?\\\]/g, repl);
  s = s.replace(/\\begin\{equation\*?\}[\s\S]*?\\end\{equation\*?\}/gi, repl);
  s = s.replace(/\\begin\{align\*?\}[\s\S]*?\\end\{align\*?\}/gi, repl);
  s = s.replace(/\\begin\{gather\*?\}[\s\S]*?\\end\{gather\*?\}/gi, repl);
  s = s.replace(/\\begin\{multline\*?\}[\s\S]*?\\end\{multline\*?\}/gi, repl);
  s = s.replace(/\\begin\{flalign\*?\}[\s\S]*?\\end\{flalign\*?\}/gi, repl);
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

function figureBlock(args: { caption: string; label: string; bodyHint: string }): string {
  const cap = escapeLatex(args.caption);
  const hint = escapeLatex(args.bodyHint);
  const lab = args.label.replace(/[^a-zA-Z0-9:_-]/g, "");
  return `\\begin{figure}[H]
    \\centering
    \\fbox{
        \\begin{minipage}[c][6cm][c]{0.85\\textwidth}
            \\centering
            \\textbf{Placeholder Figure}\\\\
            ${hint}
        \\end{minipage}
    }
    \\caption{${cap}}
    \\label{${lab}}
\\end{figure}

The figure above is a placeholder: ${hint}.`;
}

export function appendFigurePlaceholdersForChapter(
  body: string,
  args: {
    chapterOrderIndex: number;
    chapterKind: ThesisChapterKind;
    technical: boolean;
    /** When true, skip fbox placeholders (high-quality mode injects TikZ/pgfplots later). */
    highQuality?: boolean;
  },
): string {
  if (!args.technical || args.highQuality) return body;
  let out = body;
  const n = countFigureEnvironments(out);
  const blocks: string[] = [];

  if (args.chapterOrderIndex === 0 && n < 1) {
    blocks.push(
      figureBlock({
        caption: "Placeholder: conceptual framework or thesis roadmap.",
        label: "fig:intro_framework",
        bodyHint: "Insert a conceptual framework or contribution roadmap diagram tying the research question to thesis chapters.",
      }),
    );
  }
  if (args.chapterOrderIndex === 1 && n < 1) {
    blocks.push(
      figureBlock({
        caption: "Placeholder: literature map or thematic clustering of prior work.",
        label: "fig:lit_map",
        bodyHint: "Insert a literature map or schematic grouping streams of theory and evidence reviewed in this chapter.",
      }),
    );
  }
  if (args.chapterKind === "methodology") {
    const need = Math.max(0, 1 - n);
    for (let i = 0; i < need; i++) {
      blocks.push(
        figureBlock({
          caption: "Placeholder: data and estimation workflow.",
          label: `fig:method_workflow_${i + 1}`,
          bodyHint: "Insert a pipeline diagram (data sources, cleaning, sample construction, estimation, validation).",
        }),
      );
    }
  }
  if (args.chapterKind === "results") {
    const need = Math.max(0, 2 - n);
    const captions = [
      ["Placeholder: empirical distribution or time series of the main outcome.", "fig:empirical_outcome", "Insert histogram, density, or time-series plot of the dependent variable."],
      ["Placeholder: model fit or robustness comparison.", "fig:fit_robust", "Insert actual vs fitted, residual diagnostics, or robustness comparison plot."],
    ] as const;
    for (let i = 0; i < need; i++) {
      const [cap, lab, hint] = captions[i % captions.length];
      blocks.push(figureBlock({ caption: cap, label: lab, bodyHint: hint }));
    }
  }

  if (blocks.length === 0) return out;
  return `${out}\n\n${blocks.join("\n\n")}`;
}

/** Ensure at least three figure environments exist across all draft chapters (technical theses). */
export function ensureGlobalFigureMinimum(
  drafts: { title: string; content: string }[],
  technical: boolean,
  options?: { highQuality?: boolean },
): void {
  if (!technical || options?.highQuality) return;
  const total = drafts.reduce((sum, d) => sum + countFigureEnvironments(d.content), 0);
  let deficit = Math.max(0, 3 - total);
  if (deficit <= 0) return;

  let targetIdx = drafts.findIndex((d) => inferThesisChapterKind(d.title) === "results");
  if (targetIdx < 0) targetIdx = drafts.length - 1;
  if (targetIdx < 0) return;

  let k = 0;
  while (deficit > 0) {
    drafts[targetIdx].content += `\n\n${figureBlock({
      caption: `Additional empirical figure placeholder ${k + 1}.`,
      label: `fig:auto_extra_${k + 1}`,
      bodyHint: "Insert coefficient plot, robustness split, feature importance, or alternative estimator comparison as appropriate.",
    })}`;
    k += 1;
    deficit -= 1;
  }
}
