/**
 * Compile-safe illustrative TikZ / pgfplots figures and numeric tables for high-quality thesis mode.
 * Values are synthetic but internally consistent; captions say "Illustrative", never "Placeholder".
 */

import { inferThesisChapterKind } from "@/lib/thesis-prompt-standards";

/** Count TikZ picture blocks (each figure may nest one or more). */
export function countTikzOrPgfplotsFigures(body: string): number {
  return (body.match(/\\begin\{tikzpicture\}/g) || []).length;
}

export function countTableEnvironments(body: string): number {
  return (body.match(/\\begin\{table\}/g) || []).length;
}

/** Remove legacy fbox "Placeholder Figure" blocks from model output. */
export function stripFboxPlaceholderFigures(body: string): string {
  return body.replace(
    /\\begin\{figure\}\[H\][\s\S]*?\\textbf\{Placeholder Figure\}[\s\S]*?\\end\{figure\}/gi,
    "",
  );
}

export function illustrativeDescriptiveStatsTable(): string {
  return String.raw`\begin{table}[H]
\centering
\caption{Illustrative descriptive statistics for key variables (synthetic values for template completeness).}
\label{tab:descriptives_illus}
\begin{tabular}{lrrrr}
\toprule
Variable & Mean & Std.\ dev. & Min & Max \\
\midrule
Outcome $Y$ & 0.42 & 0.18 & 0.05 & 0.98 \\
Treatment $D$ & 0.31 & 0.46 & 0.00 & 1.00 \\
Control $X_1$ & 12.4 & 3.1 & 4.0 & 22.8 \\
Control $X_2$ & 0.87 & 0.21 & 0.40 & 1.35 \\
\bottomrule
\end{tabular}
\end{table}

Table~\ref{tab:descriptives_illus} reports illustrative moments intended only to demonstrate table layout; replace with project-specific estimates.`;
}

export function illustrativeMainRegressionTable(): string {
  return String.raw`\begin{table}[H]
\centering
\caption{Illustrative main regression results (synthetic coefficients).}
\label{tab:main_reg_illus}
\begin{tabular}{lrrr}
\toprule
 & Coef. & Robust SE & $t$-stat \\
\midrule
Intercept & 0.112 & 0.041 & 2.73 \\
Treatment & 0.184 & 0.062 & 2.97 \\
Controls included & \multicolumn{3}{r}{Yes} \\
\bottomrule
\end{tabular}
\end{table}

Table~\ref{tab:main_reg_illus} is illustrative; substitute estimates, standard errors, and sample counts from the empirical analysis.`;
}

export function illustrativeRobustnessTable(): string {
  return String.raw`\begin{table}[H]
\centering
\caption{Illustrative robustness checks across alternative specifications.}
\label{tab:robust_illus}
\begin{tabular}{lrr}
\toprule
Specification & Coef.\ on treatment & Notes \\
\midrule
Baseline & 0.184 & Reference \\
+ alternative controls & 0.171 & Similar magnitude \\
Alternative sample window & 0.159 & Direction preserved \\
\bottomrule
\end{tabular}
\end{table}

Table~\ref{tab:robust_illus} sketches how robustness rows should read once real models are estimated.`;
}

export function tikzConceptualFrameworkFigure(): string {
  return String.raw`\begin{figure}[H]
\centering
\begin{tikzpicture}[
  font=\small,
  box/.style={draw, rounded corners, align=center, inner sep=6pt, minimum width=2.6cm},
  arr/.style={-{Stealth[length=2mm]}, thick}
]
\node[box] (rq) {Research\\question};
\node[box, right=1.8cm of rq] (lit) {Literature\\\& hypotheses};
\node[box, right=1.8cm of lit] (meth) {Methods\\\& data};
\node[box, below=1.1cm of lit] (res) {Empirical\\results};
\node[box, below=1.1cm of res] (con) {Discussion\\\& limits};
\draw[arr] (rq) -- (lit);
\draw[arr] (lit) -- (meth);
\draw[arr] (meth) |- (res);
\draw[arr] (res) -- (con);
\end{tikzpicture}
\caption{Illustrative conceptual roadmap linking the research question to empirical design and interpretation.}
\label{fig:concept_roadmap}
\end{figure}

Figure~\ref{fig:concept_roadmap} provides a schematic overview; arrows indicate logical flow rather than causal direction.`;
}

export function tikzLiteratureStreamsFigure(): string {
  return String.raw`\begin{figure}[H]
\centering
\begin{tikzpicture}[font=\small, stream/.style={draw, align=left, inner sep=5pt, minimum width=3.2cm}]
\node[stream] (t) at (0,0) {\textbf{Theoretical stream}\\Mechanisms, definitions};
\node[stream] (e) at (4.2,0) {\textbf{Empirical stream}\\Evidence, designs};
\node[stream] (g) at (2.1,-1.8) {\textbf{Gap}\\Open tests};
\draw[-{Stealth}] (t.south east) -- (g.north);
\draw[-{Stealth}] (e.south west) -- (g.north);
\end{tikzpicture}
\caption{Illustrative mapping of literature streams converging on identified gaps.}
\label{fig:lit_streams}
\end{figure}

Figure~\ref{fig:lit_streams} is schematic; node labels should be tailored to the substantive literature review.`;
}

export function tikzMethodologyWorkflowFigure(): string {
  return String.raw`\begin{figure}[H]
\centering
\begin{tikzpicture}[
  node distance=1.1cm and 0.9cm,
  box/.style={draw, rounded corners, align=center, inner sep=5pt, minimum height=0.9cm, minimum width=2.4cm},
  arr/.style={-{Stealth}, thick}
]
\node[box] (raw) {Raw inputs};
\node[box, right=of raw] (clean) {Cleaning\\\& harmonization};
\node[box, right=of clean] (sample) {Analytical\\sample};
\node[box, below=of clean] (est) {Estimation};
\node[box, right=of est] (diag) {Diagnostics\\\& robustness};
\draw[arr] (raw) -- (clean);
\draw[arr] (clean) -- (sample);
\draw[arr] (sample) |- (est);
\draw[arr] (est) -- (diag);
\end{tikzpicture}
\caption{Illustrative data-to-estimation workflow (adapt nodes to the project's pipeline).}
\label{fig:method_workflow}
\end{figure}

Figure~\ref{fig:method_workflow} should be updated with concrete data sources, inclusion rules, and software steps.`;
}

export function tikzEvaluationFrameworkFigure(): string {
  return String.raw`\begin{figure}[H]
\centering
\begin{tikzpicture}[font=\small,
  every node/.style={draw, rounded corners, inner sep=5pt},
  arr/.style={-{Stealth}, thick}]
\node (m) at (0,0) {Model $\mathcal{M}(\theta)$};
\node (l) at (-2.6,-1.6) {Loss / objective};
\node (v) at (2.6,-1.6) {Validation metrics};
\draw[arr] (m) -- (l);
\draw[arr] (m) -- (v);
\end{tikzpicture}
\caption{Illustrative evaluation framework linking model, objective, and validation metrics.}
\label{fig:eval_framework}
\end{figure}

Figure~\ref{fig:eval_framework} is generic; replace notation with project-specific estimators and metrics.`;
}

export function pgfplotsDescriptiveOutcomeFigure(): string {
  return String.raw`\begin{figure}[H]
\centering
\begin{tikzpicture}
\begin{axis}[
  ybar,
  width=0.82\textwidth,
  height=5.8cm,
  ylabel={Illustrative share},
  symbolic x coords={Low,Mid,High},
  xtick=data,
  ymin=0, ymax=1,
  legend style={at={(0.5,-0.22)}, anchor=north, legend columns=-1}
]
\addplot coordinates {(Low,0.22) (Mid,0.41) (High,0.37)};
\addplot coordinates {(Low,0.31) (Mid,0.33) (High,0.36)};
\legend{Group A,Group B}
\end{axis}
\end{tikzpicture}
\caption{Illustrative distribution comparison for an outcome proxy across ordered bins (synthetic).}
\label{fig:desc_outcome}
\end{figure}

Figure~\ref{fig:desc_outcome} uses synthetic category shares solely to demonstrate a descriptive bar chart; replace with empirical frequencies or densities.`;
}

export function pgfplotsMainResultsCoefficientsFigure(): string {
  return String.raw`\begin{figure}[H]
\centering
\begin{tikzpicture}
\begin{axis}[
  width=0.82\textwidth,
  height=6cm,
  ylabel={Illustrative coefficient},
  xlabel={Predictor index},
  xmin=0.5, xmax=5.5,
  ymin=-0.2, ymax=0.45,
  xtick={1,2,3,4,5},
  legend pos=south east
]
\addplot+[mark=*, thick] coordinates {(1,0.12)(2,0.18)(3,-0.04)(4,0.09)(5,0.21)};
\legend{Synthetic point estimates}
\end{axis}
\end{tikzpicture}
\caption{Illustrative coefficient trace across predictors (synthetic values for layout).}
\label{fig:coef_plot}
\end{figure}

Figure~\ref{fig:coef_plot} is not an empirical result; swap in model estimates and confidence intervals.`;
}

export function pgfplotsRobustnessDiagnosticsFigure(): string {
  return String.raw`\begin{figure}[H]
\centering
\begin{tikzpicture}
\begin{axis}[
  width=0.82\textwidth,
  height=5.8cm,
  xlabel={Illustrative fitted values},
  ylabel={Residual},
  xmin=0, xmax=1, ymin=-0.35, ymax=0.35
]
\addplot+[only marks, mark=o, mark size=1pt] coordinates {
  (0.05,0.12)(0.12,-0.08)(0.18,0.05)(0.25,-0.11)(0.33,0.09)(0.41,-0.06)(0.48,0.14)(0.55,-0.09)(0.62,0.03)(0.7,-0.12)(0.78,0.07)(0.86,-0.04)(0.93,0.11)
};
\addplot[thick, domain=0:1, samples=2] {0};
\end{axis}
\end{tikzpicture}
\caption{Illustrative residual cloud against fitted values (synthetic points for diagnostics layout).}
\label{fig:resid_cloud}
\end{figure}

Figure~\ref{fig:resid_cloud} demonstrates a residual-vs-fitted diagnostic template; replace with project residuals.`;
}

export function appendixIllustrativeExtraFigure(): string {
  return String.raw`\begin{figure}[H]
\centering
\begin{tikzpicture}
\begin{axis}[
  width=0.78\textwidth,
  height=5.5cm,
  xlabel={Robustness index},
  ylabel={Illustrative estimate},
  xmin=0.5, xmax=4.5,
  xtick={1,2,3,4},
  ymin=0, ymax=0.5
]
\addplot+[mark=*, thick] coordinates {(1,0.41)(2,0.36)(3,0.33)(4,0.38)};
\end{axis}
\end{tikzpicture}
\caption{Illustrative appendix-only sensitivity trace (synthetic monotone pattern).}
\label{fig:appendix_sens}
\end{figure}

Figure~\\ref{fig:appendix_sens} summarises an appendix-only sensitivity illustration; align the pattern with your empirical robustness design.`;
}

export function appendixIllustrativeExtraTable(): string {
  return String.raw`\begin{table}[H]
\centering
\caption{Illustrative appendix-only extension (synthetic magnitudes).}
\label{tab:appendix_extra}
\begin{tabular}{lrr}
\toprule
Extension & Est. & SE \\
\midrule
Split sample A & 0.21 & 0.07 \\
Split sample B & 0.17 & 0.08 \\
\bottomrule
\end{tabular}
\end{table}`;
}

/** Appendix after `\\end{thebibliography}`: real TikZ/pgfplots + tables, no fbox placeholders. */
export function buildThesisAppendixAfterReferences(): string {
  return [
    "\\appendix",
    "\\chapter{Appendix}",
    "\\section{Additional Tables}",
    appendixIllustrativeExtraTable(),
    "\\textit{Replace illustrative magnitudes with appendix-only specifications (alternative controls, samples, estimators) from the empirical analysis.}",
    "",
    "\\section{Additional Figures}",
    appendixIllustrativeExtraFigure(),
    "\\textit{Use this section for supplementary diagnostics, placebo designs, or extended robustness plots.}",
    "",
    "\\section{Extended Derivations}",
    "\\textit{Relocate longer proofs, linearizations, and auxiliary lemmas here; keep the Methodology chapter focused on estimable objects and assumptions.}",
    "",
    "\\section{Robustness Checks}",
    "\\textit{Document alternative samples, estimators, clustering choices, placebo designs, and sensitivity tables not shown in the main text.}",
    "",
    "\\section{Data Definitions and Reproducibility}",
    "\\textit{Provide extended variable definitions, construction rules, data vendor notes, code locations, random seeds, software versions, and replication steps suitable for a public replication package.}",
  ].join("\n");
}

/**
 * Inject minimum illustrative figures/tables for high-quality technical theses.
 * Mutates `drafts` in place.
 */
/** Attach compile-safe TikZ/pgfplots blocks for any technical (quantitative) thesis export path. */
export function injectHighQualityFiguresAndTables(drafts: { title: string; content: string }[], args: { technical: boolean }): void {
  if (!args.technical) return;
  for (let i = 0; i < drafts.length; i++) {
    drafts[i].content = stripFboxPlaceholderFigures(drafts[i].content);
  }

  const findKind = (k: string) => drafts.findIndex((d) => inferThesisChapterKind(d.title) === k);

  const intro = 0;
  const lit = drafts.length > 1 ? 1 : -1;
  const meth = findKind("methodology");
  const res = findKind("results");

  if (drafts[intro]) {
    drafts[intro].content += `\n\n${tikzConceptualFrameworkFigure()}`;
  }
  if (lit >= 0 && drafts[lit]) {
    drafts[lit].content += `\n\n${tikzLiteratureStreamsFigure()}`;
  }
  if (meth >= 0 && drafts[meth]) {
    drafts[meth].content += `\n\n${tikzMethodologyWorkflowFigure()}\n\n${tikzEvaluationFrameworkFigure()}`;
  }
  if (res >= 0 && drafts[res]) {
    drafts[res].content += `\n\n${illustrativeDescriptiveStatsTable()}\n\n${illustrativeMainRegressionTable()}\n\n${illustrativeRobustnessTable()}`;
    drafts[res].content += `\n\n${pgfplotsDescriptiveOutcomeFigure()}\n\n${pgfplotsMainResultsCoefficientsFigure()}\n\n${pgfplotsRobustnessDiagnosticsFigure()}`;
  }
}
