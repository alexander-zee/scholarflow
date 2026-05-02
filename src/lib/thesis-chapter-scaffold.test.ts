import { describe, expect, it } from "vitest";
import {
  adaptScaffoldToOutlineTitle,
  getChapterScaffold,
  validateChapterStructureAgainstScaffold,
  wrapProseUnderScaffoldHeadings,
} from "./thesis-chapter-scaffold";

describe("Introduction chapter scaffold", () => {
  it("wraps prose-only LaTeX under required headings without inventing filler", () => {
    const scaffold = adaptScaffoldToOutlineTitle(getChapterScaffold("introduction"), "Introduction");
    const prose = Array.from({ length: 12 }, (_, i) => `Paragraph ${i + 1}. ` + "x".repeat(80)).join("\n\n");
    expect(prose.length).toBeGreaterThan(500);

    const wrapped = wrapProseUnderScaffoldHeadings(prose, scaffold);
    expect(wrapped).toBeTruthy();
    const body = wrapped!;

    expect(body).toContain("\\section{Introduction}");
    expect(body).toContain("\\subsection{Context and Motivation}");
    expect(body).toContain("\\subsection{Research Question}");
    expect(body).toContain("\\subsection{Structure of the Thesis}");
    expect(body.length).toBeGreaterThan(500);

    const v = validateChapterStructureAgainstScaffold(body, scaffold);
    expect(v.ok).toBe(true);
    expect(v.missing).toHaveLength(0);
  });
});
