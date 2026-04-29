/** Chapter archetype inferred from outline title for conditional prompting. */
export type ThesisChapterKind =
  | "introduction"
  | "literature"
  | "methodology"
  | "results"
  | "discussion"
  | "general";

/** Econometrics-style depth (equations, SDF examples) — inject from Chapter 3 onward only. */
export function projectWantsEconometricsDepth(field: string) {
  return /econ|finance|econometric|statistic|asset|pricing|empirical|metric|quant|economy/i.test(field || "");
}

/**
 * Technical thesis pipeline: delayed display math (first two chapters + abstract narrative-only),
 * figure minima, appendix conventions.
 */
export function projectUsesEarlyChapterMathDelay(field: string) {
  return /econ|finance|econometric|statistic|mathematic|physics|quant|empirical|metric|ML|machine learning|data science|computational|\bCS\b|computer science|economy|asset|pricing/i.test(
    field || "",
  );
}

export function inferThesisChapterKind(chapterTitle: string): ThesisChapterKind {
  const t = chapterTitle.toLowerCase();
  if (/(intro|introduction|overview|background\s+and\s+motivation)/i.test(t)) return "introduction";
  if (/(literature|related\s+work|prior\s+work|theoretical\s+background)/i.test(t)) return "literature";
  if (/(method|methodology|empirical\s+strateg|data\s+and\s+sample|econometric\s+setup|model\s+spec)/i.test(t)) return "methodology";
  if (/(result|empirical\s+result|finding|estimation\s+result|evidence)/i.test(t)) return "results";
  if (/(discuss|conclusion|summary|implication|limitation|future\s+research)/i.test(t)) return "discussion";
  return "general";
}

/** Shared econometrics / thesis drafting rules (inject only from 3rd thesis chapter onward). */
export const THESIS_ECONOMETRICS_DEPTH = [
  "Econometrics and quantitative thesis standard (when field is economics, finance, econometrics, statistics, or similar):",
  "- Provide formal model specification, assumptions, estimation method, identification logic, inference (standard errors), and robustness design where appropriate.",
  "- In Methodology: include loss/objective functions, evaluation metrics, and clearly typeset mathematics using valid LaTeX.",
  "- In Results: prefer empirical-output-first writing: baseline tables, robustness, interpretation of coefficients, economic vs statistical significance.",
  '- For asset pricing / SDF style topics when relevant, notation examples (adapt to the project): e.g. $\\mathbb{E}_t[m_{t+1} R_{i,t+1}] = 1$, linear SDF $m_{t+1} = 1 - b^{\\top} f_{t+1}$, GMM-style objectives with braces and subscripts.',
].join("\n");

/** Default math rules for Methodology, Results, and later chapters. */
export const THESIS_MATH_RULES = [
  "LaTeX mathematics (compile-safe — violations break PDF export):",
  "- Always brace subscripts and superscripts: $m_{t+1}$, $R_{i,t+1}$, $\\mathbb{E}_t[\\cdot]$, $\\varepsilon_{t+1}$, $\\hat{\\theta}$, NOT $m_t+1$, $R_i,t+1$, or bare $ _t $.",
  "- Never output empty math delimiters, dangling underscores, or fragments like \\( _t \\), \\[ _t =, or isolated _ in math mode.",
  "- Use \\( ... \\) for inline and \\[ ... \\] for display, or amsmath \\begin{equation}...\\end{equation} with labels when appropriate.",
  "- Every displayed equation must be syntactically complete (balanced braces, no placeholder-only equations).",
].join("\n");

/** First two thesis chapters (Introduction + Literature): narrative and citations only for technical theses. */
export const THESIS_MATH_RULES_EARLY_CHAPTERS = [
  "STRICT math policy for this chapter (technical thesis — Introduction or Literature position):",
  "- Remain conceptual and narrative. Cite prior work with \\citep/\\citet.",
  "- Do NOT use displayed mathematics: no \\[ ... \\], no \\begin{equation}, \\begin{align}, \\begin{gather}, \\begin{multline}, and no optimization / loss / formal probability statements as equations.",
  "- Do NOT define estimators, loss functions, or formal constraints as equations here — defer to Methodology (or Appendix for extended derivations).",
  "- Light inline notation in \\( ... \\) is allowed only when indispensable (e.g. a single symbol); avoid multi-line inline math.",
  "- You MAY and SHOULD include compile-safe \\begin{figure}[H] placeholders (fbox + minipage) with \\caption{}, \\label{}, and a short paragraph stating what the figure will show (conceptual framework, literature map, etc.).",
].join("\n");

/** Early chapters in HQ mode: same math policy, but no placeholder figure boxes (pipeline supplies TikZ). */
export const THESIS_MATH_RULES_EARLY_CHAPTERS_HQ = [
  "STRICT math policy for this chapter (technical thesis — Introduction or Literature, high-quality mode):",
  "- Remain conceptual and narrative. Cite prior work with \\citep/\\citet.",
  "- Do NOT use displayed mathematics: no \\[ ... \\], no \\begin{equation}, \\begin{align}, \\begin{gather}, \\begin{multline}, and no optimization / loss / formal probability statements as equations.",
  "- Do NOT define estimators, loss functions, or formal constraints as equations here — defer to Methodology (or Appendix for extended derivations).",
  "- Light inline notation in \\( ... \\) is allowed only when indispensable (e.g. a single symbol); avoid multi-line inline math.",
  "- Do NOT add \\begin{figure} fbox placeholders; omit figure environments here unless you output full TikZ/pgfplots code (normally omit).",
].join("\n");

export const THESIS_FIGURE_PLACEHOLDER_RULES = [
  "Figure placeholders (compile-safe LaTeX):",
  "- Use \\begin{figure}[H] ... \\end{figure} with \\centering, \\fbox{ \\begin{minipage}[c][6cm][c]{0.85\\textwidth} ... \\end{minipage} }, \\textbf{Placeholder Figure}, \\caption{...}, \\label{fig:...}.",
  "- After each figure, add one short paragraph explaining what the final figure should display (data flow, time series, residuals, coefficient plot, etc.).",
  "- Introduction/Literature (technical): optional conceptual or literature-map figure.",
  "- Methodology: at least one workflow / data-pipeline diagram placeholder.",
  "- Results: at least two empirical figure placeholders (e.g. outcome distribution, actual vs fitted, robustness comparison, residual diagnostics).",
].join("\n");

/** High-quality thesis mode: no fbox placeholders; TikZ/pgfplots blocks are injected by the pipeline. */
export const THESIS_FIGURE_HQ_RULES = [
  "Figures (high-quality technical thesis):",
  "- Do NOT insert \\fbox placeholder figures or captions containing the word Placeholder.",
  "- Do NOT use \\begin{figure} in Introduction or Literature unless you can supply full compile-ready TikZ/pgfplots code yourself; normally omit figures in those chapters (the pipeline may attach illustrative diagrams).",
  "- From Methodology onward you may include compile-ready TikZ/pgfplots figures; if unsure, describe plots in prose and let the pipeline attach illustrative charts.",
  "- Every figure you add must include \\caption{}, \\label{fig:...}, and a short interpretation paragraph with Figure~\\ref{...}.",
].join("\n");

/** Introduction chapter skeleton enforced in high-quality mode (each \\section exactly once, in this order). */
export const THESIS_INTRODUCTION_HQ_SECTIONS = [
  "MANDATORY Introduction structure — use these \\section titles exactly once each, in this order (renumber via LaTeX automatically):",
  "- \\section{Research Background}",
  "- \\section{Problem Statement}",
  "- \\section{Research Objective and Research Question}",
  "- \\section{Contribution}",
  "- \\section{Scope and Limitations}",
  "- \\section{Structure of the Thesis}",
  "Do not add a second \\section{Research Background}, second Research Objective block, or duplicate roadmap / problem framing elsewhere in this chapter.",
].join("\n");

export const THESIS_CITATION_RULES = [
  "Citations:",
  "- Use plausible natbib keys: \\citep{AuthorYearTopic}, \\citet{AuthorYearTopic}.",
  "- If no source exists for a claim, use \\citep{citation_needed} and/or line comment: % CITATION NEEDED: ...",
  '- Never output empty \\citep{}, fake "author?", or citation placeholders with question marks.',
].join("\n");

export const THESIS_FILLER_BAN = [
  "Avoid generic filler unless tightly tied to evidence:",
  '- Do not lean on phrases like "This thesis aims to contribute", "complex and multifaceted phenomena", "state-of-the-art", "substantial progress has been made" as substitutes for argument.',
  "- Each paragraph should move claim → method or evidence → interpretation.",
].join("\n");

export const THESIS_RESULTS_TABLE_GUIDE = [
  "Results chapter expectations:",
  "- Include at least two booktabs-style tables (\\begin{table}...\\begin{tabular}...\\toprule...\\midrule...\\bottomrule) even if cells use -- or [fill] for numbers the student will replace.",
  "- After each major table, interpret: what improves, economic magnitude, statistical credibility, robustness, and remaining limitations.",
  "- Include at least two figure placeholders for empirical plots/diagnostics as specified in the figure rules.",
].join("\n");

export const THESIS_RESULTS_TABLE_GUIDE_HQ = [
  "Results chapter (high-quality mode):",
  "- Include at least three booktabs tables with substantive illustrative or project-consistent numeric entries; avoid a table where every numeric cell is \"--\".",
  "- After each table: what is estimated, statistical reading, economic/substantive reading, and caution/limitation.",
  "- Prefer prose for extra plots if needed; the pipeline may attach pgfplots diagnostics.",
].join("\n");

export function chapterKindGuidance(kind: ThesisChapterKind): string {
  switch (kind) {
    case "introduction":
      return "This chapter should read as a serious Introduction: research background; problem statement; research objective; research question; contribution; thesis structure. Use nested \\section / \\subsection; avoid a single long block.";
    case "literature":
      return "Literature review structure: theoretical foundations; empirical literature; econometric/methodological literature; research gap; hypotheses or testable expectations. Mostly narrative; minimal formal math unless essential.";
    case "methodology":
      return "Methodology must include: data and sample construction; variable definitions; econometric model; estimation strategy; identification assumptions; evaluation metrics; robustness checks. Formal displayed equations start here: multiple \\[ ... \\] or equation environments with correct bracing — at least five substantive equation lines or numbered equations across the chapter.";
    case "results":
      return THESIS_RESULTS_TABLE_GUIDE;
    case "discussion":
      return "Discussion / conclusion: summary of findings; theoretical and practical implications; limitations; future research; firm final conclusion — still using \\section hierarchy, not one wall of text.";
    default:
      return "Use a deep hierarchy (\\section, \\subsection, \\subsubsection) appropriate to a BSc/MSc thesis chapter; avoid undifferentiated long paragraphs.";
  }
}

export const THESIS_OUTLINE_BLUEPRINT_HINT = `
Preferred chapter themes for quantitative theses (adapt titles to the project; keep this depth in JSON "sections"):
- Introduction: background, problem, objectives, RQ, contribution, roadmap.
- Literature review: theory, empirical work, methods, gap, hypotheses.
- Methodology: data, variables, model, estimation, identification, metrics, robustness.
- Results: descriptives, baseline, main specs, robustness, interpretation, limitations of results.
- Discussion and conclusion: synthesis, implications, limits, future work, conclusion.
`.trim();
