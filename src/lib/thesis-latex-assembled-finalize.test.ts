import { describe, expect, it } from "vitest";
import { finalizeAssembledThesisLatexForPdfCompile } from "@/lib/thesis-latex-assembled-finalize";

const TEX_WITH_MISSING_GRAPHIC = String.raw`\documentclass{report}
\usepackage{hyperref}
\usepackage{amsmath}
\usepackage{booktabs}
\usepackage{graphicx}
\usepackage{float}
\begin{document}
\chapter*{Abstract}
Testing.
\chapter*{Declaration}
Testing.
\tableofcontents
\clearpage
\chapter{Results and Analysis}
Figure~ shows the main trend.
\begin{figure}[H]
\centering
\includegraphics[width=0.8\textwidth]{smoking_trends.pdf}
\caption{Smoking trend over time}
\label{fig:smoking_trend}
\end{figure}
\[
y_i = \alpha + \beta x_i + \varepsilon_i
\]
\begin{table}[H]
\centering
\caption{Test table}
\begin{tabular}{lc}
\toprule
Model & MSE \\
\midrule
OLS & 0.12 \\
\bottomrule
\end{tabular}
\end{table}
\end{document}
`;

describe("finalizeAssembledThesisLatexForPdfCompile", () => {
  it("replaces missing includegraphics figure with compile-safe placeholder", () => {
    const finalized = finalizeAssembledThesisLatexForPdfCompile(TEX_WITH_MISSING_GRAPHIC);
    expect(finalized).not.toMatch(/includegraphics(?:\[[^\]]*\])?\{smoking_trends\.pdf\}/i);
    expect(finalized).toContain("\\fbox{\\begin{minipage}{0.85\\textwidth}");
    expect(finalized).toContain("\\caption{Smoking trend over time}");
    expect(finalized).toContain("\\label{fig:smoking_trend}");
  });
});
