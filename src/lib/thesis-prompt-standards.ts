/** Chapter archetype inferred from outline title for conditional prompting. */
export type ThesisChapterKind =
  | "introduction"
  | "literature"
  | "methodology"
  | "results"
  | "discussion"
  | "appendix"
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
  if (/(appendix|supplement|supplementary\s+material|online\s+appendix)/i.test(t)) return "appendix";
  if (/(intro|introduction|overview|background\s+and\s+motivation)/i.test(t)) return "introduction";
  if (/(literature|related\s+work|prior\s+work|theoretical\s+background)/i.test(t)) return "literature";
  /** Results before discussion so titles like "Results and Discussion" classify as results. */
  if (
    /(results?\s+and\s+analysis|results?\s+and\s+discussion|empirical\s+results|main\s+results|quantitative\s+results|estimation\s+results|statistical\s+results|baseline\s+estimates|result\s+chapter)/i.test(
      t,
    ) ||
    (/\bresults?\b/i.test(t) && /\b(analysis|findings?|evidence|estimates)\b/i.test(t))
  ) {
    return "results";
  }
  if (
    /(method|methodology|research\s+design|identification|econometric\s+setup|empirical\s+strateg|data\s+and\s+methods?|data\s+and\s+sample|model\s+spec|estimation\s+framework|quantitative\s+framework|measurement|sampling\s+design)/i.test(
      t,
    )
  ) {
    return "methodology";
  }
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

/** Legacy block; prefer `buildUploadOnlyCitationRules` from the full-draft pipeline. */
export const THESIS_CITATION_RULES = [
  "Citations:",
  "- Prefer project-grounded keys (see dynamic citation block when sources are attached).",
  "- If no source exists for a claim, paraphrase cautiously without a cite key; do not invent AuthorYear keys.",
  '- Never output empty \\cite{}, \\citep{}, \\citet{}, \\parencite{}, \\textcite{}, \\autocite{}, or any citation command with an empty brace argument.',
  '- If no valid uploaded key applies, write the plain phrase [citation needed] in running text — never an empty cite command.',
  '- Never output empty \\citep{}, fake "author?", or citation placeholders with question marks.',
].join("\n");

/** Natbib keys `uploaded1`…`uploadedN` align with `thesis-latex-export` bibliography generation. */
export function buildUploadOnlyCitationRules(uploadedFileNames: string[]): string {
  const names = uploadedFileNames.map((n) => n.trim()).filter(Boolean);
  if (!names.length) {
    return [
      "Citations (no uploaded sources in this project):",
      "- Do NOT invent \\citep{AuthorYear} or Angrist1996IV-style keys.",
      "- Attribute prior work in narrative prose; you may use footnote-style \\footnote{...} with descriptive text only.",
      "- Do NOT use \\citep{citation_needed}, empty \\cite{} / \\citep{} / \\citet{} / \\parencite{} / \\textcite{} / \\autocite{}, or bracket citations that imply a bibliography entry you cannot support.",
      "- If you cannot cite, output [citation needed] as plain text, not an empty LaTeX citation command.",
    ].join("\n");
  }
  const mapping = names
    .map((name, i) => {
      const key = `uploaded${i + 1}`;
      return `[${i + 1}] = \\citep{${key}} → file: ${JSON.stringify(name)}`;
    })
    .join("\n");
  const keys = names.map((_, i) => `uploaded${i + 1}`).join(", ");
  return [
    "Citations (STRICT — uploaded sources only):",
    mapping,
    `- The ONLY permitted \\citep / \\citet keys are: ${keys}.`,
    "- Match each substantive empirical or literature claim to the numbered source whose excerpt best supports it.",
    "- FORBIDDEN: any other \\citep{...} key, \\citep{citation_needed}, empty \\cite{} / \\citep{} / \\citet{} / \\parencite{} / \\textcite{} / \\autocite{}, or invented author–year keys.",
    "- If no key fits, use plain [citation needed]; never empty citation braces.",
    "- In prose you may also write bracket numbers [1]…[n] matching the same order as above.",
  ].join("\n");
}

/** Full document schema the model must respect chapter-by-chapter (Abstract is separate). */
export const THESIS_DOCUMENT_SCHEMA = [
  "Thesis document schema (BSc/MSc STEM / econometrics style):",
  "- Use \"and\" in headings instead of slash characters \"/\" inside \\section{...} and \\subsection{...} titles (e.g. prefer \"Results and Analysis\", never \"Results / Analysis\").",
  "- Abstract: separate pass (no \\chapter here).",
  "- Introduction: nested \\section and \\subsection; roadmap; research question; contribution.",
  "- Literature review: thematic \\subsection blocks (theory, evidence, gap).",
  "- Methodology: data, estimators, assumptions, equations (valid LaTeX) where appropriate.",
  "- Results and analysis: MUST include \\subsection{Descriptive Results}, \\subsection{Model Results}, \\subsection{Robustness Checks} (titles may be lightly adapted but keep these three themes), at least one booktabs table, and at least one figure environment with \\label and in-text references using Figure~\\ref{...} and Table~\\ref{...}.",
  "- Discussion / conclusion: implications, limitations, future work.",
  "- References list: export builds the bibliography from your \\citep{uploadedN} keys — do not fabricate standalone \\bibitem text in chapter bodies.",
  "- Appendix (when present): supplementary tables/figures/definitions tied to the thesis topic — no generic boilerplate about replacing illustrative numbers.",
].join("\n");

export const THESIS_FILLER_BAN = [
  "Avoid generic filler unless tightly tied to evidence:",
  '- Do not lean on phrases like "This thesis aims to contribute", "complex and multifaceted phenomena", "state-of-the-art", "substantial progress has been made" as substitutes for argument.',
  "- Each paragraph should move claim → method or evidence → interpretation.",
  "Forbidden scaffold / meta prose (submission drafts must read as finished argument, not instructions):",
  '- Never write: "This passage develops", "This passage addresses", "This section will", "This subsection is included to preserve", or "replace with …" / bracket stubs like [fill], [coefficient], [sample size].',
  "- Write concrete claims, definitions, and interpretation; if numbers are illustrative, say so once in plain language and still report plausible magnitudes tied to the literature.",
].join("\n");

export const THESIS_RESULTS_TABLE_GUIDE = [
  "Results chapter expectations (mandatory structure):",
  "- Use \\subsection{Descriptive Results}, \\subsection{Model Results}, and \\subsection{Robustness Checks} (headings may be slightly rephrased but must preserve these three themes).",
  "- Include at least one booktabs-style table (\\begin{table}...\\begin{tabular}...\\toprule...\\midrule...\\bottomrule) with \\caption{...} and \\label{tab:...}.",
  "- Include at least one \\begin{figure}...[\\end{figure} with \\caption and \\label{fig:...}; the prose must reference it as Figure~\\\\ref{fig:...} (never a bare Figure~ without \\\\ref).",
  "- After each table and each figure, add at least one paragraph interpreting what the reader should learn.",
  "- Prefer a second table and second figure when the topic supports it; label every float and cite it in text.",
].join("\n");

export const THESIS_RESULTS_TABLE_GUIDE_HQ = [
  "Results chapter (high-quality mode):",
  "- Same mandatory \\subsection themes as standard mode: Descriptive Results; Model Results; Robustness Checks.",
  "- Include at least two booktabs tables with substantive numeric entries (illustrative is acceptable if clearly labeled in the caption as stylised for the thesis topic).",
  "- Include at least two figure environments (TikZ/pgfplots preferred) each with \\caption, \\label, and in-text Figure~\\\\ref{...}.",
  "- After each table and figure: estimation target, statistical reading, economic or substantive reading, and limitations.",
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
    case "appendix":
      return [
        "Appendix (must be substantive, topic-specific supplementary material):",
        "- Use \\section blocks for e.g. Extended notation, Additional estimators, Robustness extensions, Variable dictionary, or Algorithmic detail tied to the thesis topic.",
        "- Include at least one supplementary table OR one supplementary figure with captions/labels and interpretation paragraphs.",
        "- Forbidden boilerplate: do not write sentences that only tell the student to replace illustrative magnitudes, synthetic values, or template completeness.",
      ].join("\n");
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
