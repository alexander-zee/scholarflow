/**
 * Hard-constrained LaTeX structure per thesis chapter archetype.
 * Generator MUST preserve every \\section / \\subsection line; only body text under each subsection is model-filled.
 */

import { escapeLatex } from "@/lib/latex-escape";
import type { ThesisChapterKind } from "@/lib/thesis-prompt-standards";

export type ChapterScaffold = {
  /** Validator-aligned constraints echoed in prompts */
  constraints: {
    requiredSections: number;
    minSubsectionsPerSection: number;
    resultsMustContain: string[];
    minParagraphsPerSubsection: number;
  };
  /** One primary \\section per draft chapter file, with ordered \\subsection blocks */
  sections: {
    title: string;
    subsections: {
      title: string;
      minParagraphs: number;
      /** Extra LaTeX or content rules for this slot only */
      extraRules?: string;
    }[];
  }[];
};

const INTRO: ChapterScaffold = {
  constraints: {
    requiredSections: 1,
    minSubsectionsPerSection: 3,
    resultsMustContain: [],
    minParagraphsPerSubsection: 2,
  },
  sections: [
    {
      title: "Introduction",
      subsections: [
        { title: "Context and Motivation", minParagraphs: 2 },
        { title: "Research Question", minParagraphs: 2 },
        { title: "Structure of the Thesis", minParagraphs: 2 },
      ],
    },
  ],
};

const LITERATURE: ChapterScaffold = {
  constraints: {
    requiredSections: 1,
    minSubsectionsPerSection: 3,
    resultsMustContain: [],
    minParagraphsPerSubsection: 2,
  },
  sections: [
    {
      title: "Literature Review",
      subsections: [
        { title: "Core Concepts", minParagraphs: 2 },
        { title: "Empirical Findings", minParagraphs: 2 },
        { title: "Research Gap", minParagraphs: 2 },
      ],
    },
  ],
};

const METHODOLOGY: ChapterScaffold = {
  constraints: {
    requiredSections: 1,
    minSubsectionsPerSection: 3,
    resultsMustContain: [],
    minParagraphsPerSubsection: 2,
  },
  sections: [
    {
      title: "Methodology",
      subsections: [
        { title: "Model Setup", minParagraphs: 2, extraRules: "Include at least one displayed equation or formal specification where appropriate." },
        { title: "Data and Variables", minParagraphs: 2 },
        { title: "Estimation Strategy", minParagraphs: 2 },
      ],
    },
  ],
};

const RESULTS: ChapterScaffold = {
  constraints: {
    requiredSections: 1,
    minSubsectionsPerSection: 3,
    resultsMustContain: ["descriptive", "model", "robustness"],
    minParagraphsPerSubsection: 2,
  },
  sections: [
    {
      title: "Results and Analysis",
      subsections: [
        {
          title: "Descriptive Results",
          minParagraphs: 2,
          extraRules: "Summarise patterns, sample, and measurement; tables optional but encouraged.",
        },
        {
          title: "Model Results",
          minParagraphs: 2,
          extraRules: "MUST include at least one complete \\begin{table}...\\end{table} with \\caption and \\label{tab:...}.",
        },
        {
          title: "Robustness Checks",
          minParagraphs: 2,
          extraRules: "MUST include at least one \\begin{figure}...\\end{figure} with \\caption and \\label{fig:...}, or extend Model Results figure count if already satisfied there.",
        },
      ],
    },
  ],
};

const DISCUSSION: ChapterScaffold = {
  constraints: {
    requiredSections: 1,
    minSubsectionsPerSection: 3,
    resultsMustContain: [],
    minParagraphsPerSubsection: 2,
  },
  sections: [
    {
      title: "Discussion and Conclusion",
      subsections: [
        { title: "Interpretation", minParagraphs: 2 },
        { title: "Limitations", minParagraphs: 2 },
        { title: "Future Research", minParagraphs: 2 },
      ],
    },
  ],
};

const APPENDIX: ChapterScaffold = {
  constraints: {
    requiredSections: 1,
    minSubsectionsPerSection: 3,
    resultsMustContain: [],
    minParagraphsPerSubsection: 2,
  },
  sections: [
    {
      title: "Appendix",
      subsections: [
        { title: "Extended Definitions and Notation", minParagraphs: 2 },
        { title: "Additional Robustness", minParagraphs: 2, extraRules: "Prefer a supplementary table or figure tied to the thesis topic." },
        { title: "Supplementary Material", minParagraphs: 2 },
      ],
    },
  ],
};

/** Fallback when outline title does not match a standard archetype */
const GENERAL: ChapterScaffold = {
  constraints: {
    requiredSections: 1,
    minSubsectionsPerSection: 3,
    resultsMustContain: [],
    minParagraphsPerSubsection: 2,
  },
  sections: [
    {
      title: "Chapter",
      subsections: [
        { title: "Background and Scope", minParagraphs: 2 },
        { title: "Analysis", minParagraphs: 2 },
        { title: "Implications", minParagraphs: 2 },
      ],
    },
  ],
};

const SCAFFOLDS: Record<ThesisChapterKind, ChapterScaffold> = {
  introduction: INTRO,
  literature: LITERATURE,
  methodology: METHODOLOGY,
  results: RESULTS,
  discussion: DISCUSSION,
  appendix: APPENDIX,
  general: GENERAL,
};

export function getChapterScaffold(kind: ThesisChapterKind): ChapterScaffold {
  return SCAFFOLDS[kind] ?? GENERAL;
}

/** Replace template primary section title with outline chapter title (first section only). */
export function adaptScaffoldToOutlineTitle(scaffold: ChapterScaffold, outlineChapterTitle: string): ChapterScaffold {
  const t = outlineChapterTitle.trim();
  if (!t) return scaffold;
  const sections = scaffold.sections.map((s, i) => (i === 0 ? { ...s, title: t } : s));
  return { ...scaffold, sections };
}

/** Section and subsection headings only (escaped), for repair / validation prompts. */
export function renderScaffoldHeadingsOnlyLatex(scaffold: ChapterScaffold): string {
  const lines: string[] = [];
  for (const sec of scaffold.sections) {
    lines.push(`\\section{${escapeLatex(sec.title)}}`);
    for (const sub of sec.subsections) {
      lines.push(`\\subsection{${escapeLatex(sub.title)}}`);
    }
  }
  return lines.join("\n");
}

/** Last-resort body so validators always see required headings (placeholder prose). */
export function renderScaffoldMinimalPlaceholderBody(scaffold: ChapterScaffold): string {
  const parts: string[] = [];
  for (const sec of scaffold.sections) {
    parts.push(`\\section{${escapeLatex(sec.title)}}\n\n`);
    for (const sub of sec.subsections) {
      const p1 = `This passage addresses \\emph{${escapeLatex(sub.title)}} in the context of the thesis research question. It synthesises the preceding discussion and states the claims that will be substantiated in the remainder of the chapter.`;
      const p2 = `The analysis proceeds by clarifying definitions, assumptions, and limitations before connecting implications to the broader literature. Where empirical detail is not yet available, the text states hypotheses and required evidence rather than fabricating estimates.`;
      parts.push(
        `\\subsection{${escapeLatex(sub.title)}}\n\n${p1}\n\n${p2}\n\n`,
      );
    }
  }
  return parts.join("").trim();
}

export function renderScaffoldSkeletonLatex(scaffold: ChapterScaffold): string {
  const parts: string[] = [];
  for (const sec of scaffold.sections) {
    const secTitle = escapeLatex(sec.title);
    const subs = sec.subsections
      .map((sub) => {
        const subTitle = escapeLatex(sub.title);
        return `\\subsection{${subTitle}}\n\\textit{(STRUCTURE\\_SLOT: expand with at least ${sub.minParagraphs} paragraphs${sub.extraRules ? `; ${sub.extraRules}` : ""})}`;
      })
      .join("\n\n");
    parts.push(`\\section{${secTitle}}\n\n${subs}`);
  }
  return parts.join("\n\n\n");
}

export type FlatSubsectionSlot = {
  sectionTitle: string;
  subsectionTitle: string;
  minParagraphs: number;
  extraRules?: string;
};

export function flattenScaffoldSlots(scaffold: ChapterScaffold): FlatSubsectionSlot[] {
  const out: FlatSubsectionSlot[] = [];
  for (const sec of scaffold.sections) {
    for (const sub of sec.subsections) {
      out.push({
        sectionTitle: sec.title,
        subsectionTitle: sub.title,
        minParagraphs: sub.minParagraphs,
        extraRules: sub.extraRules,
      });
    }
  }
  return out;
}

/** Escape for regex literal inside LaTeX \\subsection{...} */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Verify body contains every required \\subsection title from the scaffold (after adaptation).
 */
export function validateChapterStructureAgainstScaffold(body: string, scaffold: ChapterScaffold): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  const sectionCount = (body.match(/\\section\*?\{[^}]+\}/g) || []).length;
  if (sectionCount < scaffold.constraints.requiredSections) {
    missing.push(`sections: need >= ${scaffold.constraints.requiredSections}, found ${sectionCount}`);
  }
  for (const sec of scaffold.sections) {
    const secEscaped = escapeRegExp(escapeLatex(sec.title));
    if (!new RegExp(`\\\\section\\*?\\{${secEscaped}\\}`).test(body)) {
      missing.push(`missing \\section{${sec.title}}`);
    }
    for (const sub of sec.subsections) {
      const subEscaped = escapeRegExp(escapeLatex(sub.title));
      if (!new RegExp(`\\\\subsection\\*?\\{${subEscaped}\\}`).test(body)) {
        missing.push(`missing \\subsection{${sub.title}}`);
      }
    }
  }
  const subCount = (body.match(/\\subsection\*?\{[^}]+\}/g) || []).length;
  const minTotal = scaffold.sections.reduce((n, s) => n + s.subsections.length, 0);
  if (subCount < minTotal) {
    missing.push(`subsections: need at least ${minTotal} headings, found ${subCount}`);
  }
  return { ok: missing.length === 0, missing };
}

export function buildStrictStructureRepairPrompt(args: {
  missing: string[];
  referenceScaffold: string;
  brokenBody: string;
  citationRulesBlock: string;
}): string {
  return `
You must repair the thesis chapter LaTeX so it passes automated structure validation.

Problems detected:
${args.missing.map((m) => `- ${m}`).join("\n")}

REFERENCE SCAFFOLD (your output MUST contain every \\section and \\subsection heading below verbatim; keep order; then integrate prose from the broken draft under the correct headings):
${args.referenceScaffold}

Citation policy:
${args.citationRulesBlock}

Rules:
- Return the FULL chapter LaTeX body only (no preamble; no \\chapter).
- DO NOT omit any \\section or \\subsection from the reference scaffold.
- If content is missing for a subsection, write substantive placeholder prose (still >= 2 paragraphs per subsection) rather than deleting headings.

Broken draft to salvage and realign:
${args.brokenBody}
`.trim();
}

export function formatStructureConstraintsJson(scaffold: ChapterScaffold): string {
  return JSON.stringify(
    {
      requiredSections: scaffold.constraints.requiredSections,
      minSubsectionsPerSection: scaffold.constraints.minSubsectionsPerSection,
      minParagraphsPerSubsection: scaffold.constraints.minParagraphsPerSubsection,
      resultsMustContain: scaffold.constraints.resultsMustContain,
      requiredSubsectionTitles: flattenScaffoldSlots(scaffold).map((s) => `${s.sectionTitle} › ${s.subsectionTitle}`),
    },
    null,
    2,
  );
}
