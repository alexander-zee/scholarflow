import { describe, expect, it } from "vitest";
import { auditChapterBody, auditFullThesisQualityGate, classifyQualityGateHitSeverity } from "./thesis-quality-audit";

describe("quality gate severity split", () => {
  it("treats appendix missing as warning (non-blocking draft policy)", () => {
    const hits = auditFullThesisQualityGate({
      abstractLatex: "This abstract has sufficient words and no display math.",
      drafts: [
        {
          title: "Introduction",
          content:
            "\\section{Introduction}\n\\subsection{Background}\nText.\n\\subsection{Problem Statement}\nText.\n\\subsection{Contributions}\nText.",
        },
        {
          title: "Methodology",
          content:
            "\\section{Methodology}\n\\subsection{Model Setup}\nText.\n\\subsection{Identification}\nText.\n\\subsection{Estimation}\n\\begin{equation}y=x\\end{equation}",
        },
      ],
      technicalPipeline: true,
      highQualityThesis: false,
      allowedNatbibKeys: [],
    });

    const appendixHit = hits.find((h) => h.code === "appendix_missing");
    expect(appendixHit).toBeTruthy();
    expect(classifyQualityGateHitSeverity(appendixHit!)).toBe("warning");
  });

  it("keeps bibliographic placeholder phrase as warning", () => {
    const sev = classifyQualityGateHitSeverity({
      scope: "corpus",
      code: "placeholder_phrase",
      detail: "placeholder",
    });
    expect(sev).toBe("warning");
  });

  it("treats scaffold-template leaks as warning for repair telemetry only", () => {
    expect(
      classifyQualityGateHitSeverity({
        scope: "Introduction",
        code: "ban_this_passage_develops",
        detail: "meta",
      }),
    ).toBe("warning");
  });

  it("regression guard: two runs keep similar structural quality floors", () => {
    const runA = `
\\section{Methodology}
\\subsection{Model Setup}
Text.
\\subsection{Identification}
\\begin{equation} y=\\alpha+\\beta x+\\epsilon \\end{equation}
\\subsection{Estimation}
\\begin{align}
\\hat{\\beta} = (X'X)^{-1}X'y
\\end{align}
Text.
\\section{Results}
\\subsection{Descriptive Evidence}
Text.
\\subsection{Model Estimates}
\\begin{table}[H]\\caption{t}\\label{tab:t}\\begin{tabular}{lc}\\toprule a&b\\\\\\bottomrule\\end{tabular}\\end{table}
\\subsection{Robustness}
\\begin{figure}[H]\\caption{f}\\label{fig:f}\\end{figure}
Text.
`.trim();
    const runB = runA.replace("Text.", "Expanded text.");
    const aMethodIssues = auditChapterBody(runA, "methodology", {
      chapterOrderIndex: 2,
      technicalPipeline: true,
      highQualityThesis: false,
    });
    const bMethodIssues = auditChapterBody(runB, "methodology", {
      chapterOrderIndex: 2,
      technicalPipeline: true,
      highQualityThesis: false,
    });
    expect(aMethodIssues.some((i) => i.code === "method_math_sparse")).toBe(false);
    expect(bMethodIssues.some((i) => i.code === "method_math_sparse")).toBe(false);
  });
});
