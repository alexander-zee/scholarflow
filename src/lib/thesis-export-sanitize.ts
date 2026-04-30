/**
 * Best-effort fixes so thesis export is never blocked on minor LaTeX issues.
 */

import { sanitizeBlankCitationsInLatex } from "@/lib/thesis-citation-sanitize";

export type ExportSanitizeStats = {
  blankCitationReplacements: number;
  danglingFigureRefsFixed: number;
  danglingTableRefsFixed: number;
  citationNeededKeysRemoved: number;
};

/** Replace bare `Figure~` / `Table~` not followed by `\\ref{...}` (common model mistake). */
export function sanitizeDanglingFloatTildeRefs(input: string): { text: string; figuresFixed: number; tablesFixed: number } {
  const reFig = /Figure~(?!\\ref\{)/g;
  const reTab = /Table~(?!\\ref\{)/g;
  const figBefore = (input.match(reFig) || []).length;
  const tabBefore = (input.match(reTab) || []).length;
  const text = input.replace(reFig, "Figure [check reference]").replace(reTab, "Table [check reference]");
  return {
    text,
    figuresFixed: figBefore,
    tablesFixed: tabBefore,
  };
}

/** Remove forbidden `\\citep{citation_needed}` style keys → plain text marker. */
export function sanitizeCitationNeededKeys(input: string): { text: string; removed: number } {
  const re = /\\cite[pt]?\{citation_needed\}/gi;
  const before = (input.match(re) || []).length;
  const text = input.replace(re, "[citation needed]");
  return { text, removed: before };
}

/**
 * Run recoverable sanitizers on one body (after blank-cite sanitization if desired).
 * Order: citation_needed keys → dangling floats → (caller may run blank cites before this).
 */
export function sanitizeRecoverableExportLatexFragment(
  input: string,
  opts?: { uploadFallbackKeys?: string[] },
): { text: string; stats: ExportSanitizeStats } {
  let text = input;
  let blankCitationReplacements = 0;
  const citePass = sanitizeBlankCitationsInLatex(text, opts);
  text = citePass.text;
  blankCitationReplacements = citePass.replacementCount;
  const cn = sanitizeCitationNeededKeys(text);
  text = cn.text;
  const fl = sanitizeDanglingFloatTildeRefs(text);
  text = fl.text;
  return {
    text,
    stats: {
      blankCitationReplacements,
      danglingFigureRefsFixed: fl.figuresFixed,
      danglingTableRefsFixed: fl.tablesFixed,
      citationNeededKeysRemoved: cn.removed,
    },
  };
}

export function sanitizeRecoverableExportCorpus(args: {
  chapters: { title: string; content: string }[];
  abstractLatex: string | null;
  uploadFallbackKeys?: string[];
}): {
  chapters: { title: string; content: string }[];
  abstractLatex: string | null;
  stats: ExportSanitizeStats;
} {
  const acc: ExportSanitizeStats = {
    blankCitationReplacements: 0,
    danglingFigureRefsFixed: 0,
    danglingTableRefsFixed: 0,
    citationNeededKeysRemoved: 0,
  };
  const chapters = args.chapters.map((ch) => {
    const { text, stats } = sanitizeRecoverableExportLatexFragment(ch.content, {
      uploadFallbackKeys: args.uploadFallbackKeys,
    });
    acc.blankCitationReplacements += stats.blankCitationReplacements;
    acc.danglingFigureRefsFixed += stats.danglingFigureRefsFixed;
    acc.danglingTableRefsFixed += stats.danglingTableRefsFixed;
    acc.citationNeededKeysRemoved += stats.citationNeededKeysRemoved;
    return { ...ch, content: text };
  });
  let abstractLatex = args.abstractLatex;
  if (abstractLatex) {
    const { text, stats } = sanitizeRecoverableExportLatexFragment(abstractLatex, {
      uploadFallbackKeys: args.uploadFallbackKeys,
    });
    abstractLatex = text;
    acc.blankCitationReplacements += stats.blankCitationReplacements;
    acc.danglingFigureRefsFixed += stats.danglingFigureRefsFixed;
    acc.danglingTableRefsFixed += stats.danglingTableRefsFixed;
    acc.citationNeededKeysRemoved += stats.citationNeededKeysRemoved;
  }
  return { chapters, abstractLatex, stats: acc };
}
