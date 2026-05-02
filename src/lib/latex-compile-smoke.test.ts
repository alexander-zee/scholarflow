import { describe, expect, it } from "vitest";
import { compileThesisLatexToPdf } from "@/lib/compile-latex-pdf";
import { repairTexForCompileRetry } from "@/lib/thesis-latex-compile-repair";

const MINIMAL_TEX = String.raw`\documentclass{report}
\usepackage{hyperref}
\usepackage{amsmath}
\usepackage{booktabs}
\usepackage{graphicx}
\begin{document}
\title{Compile Test Thesis}
\author{Alexander Zee}
\maketitle
\tableofcontents
\chapter{Introduction}
\section{Test Section}
This is a compiled LaTeX test.
\[
Y_i = \alpha + \beta X_i + \varepsilon_i
\]
\begin{table}[h]
\centering
\caption{Test Table}
\begin{tabular}{lc}
\toprule
Model & MSE \\
\midrule
OLS & 0.12 \\
Tree & 0.09 \\
\bottomrule
\end{tabular}
\end{table}
\end{document}
`;

describe("latex compile smoke test", () => {
  it("compiles a minimal hardcoded thesis .tex", async () => {
    const repaired = repairTexForCompileRetry(MINIMAL_TEX);
    const out = await compileThesisLatexToPdf({
      texForTectonic: MINIMAL_TEX,
      texForPdflatex: MINIMAL_TEX,
      texForTectonicRepair: repaired,
      texForPdflatexRepair: repaired,
    });
    console.log("[latex-compile-smoke] outcome", JSON.stringify(out.attempts, null, 2));
    expect(out.pdf?.length || 0).toBeGreaterThan(1000);
  }, 240_000);
});
