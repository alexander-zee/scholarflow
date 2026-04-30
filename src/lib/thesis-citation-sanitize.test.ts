import { describe, expect, it } from "vitest";
import {
  findBlankCitationHitsInCorpus,
  findBlankCitationHitsInText,
  latexHasBlankCitationCommands,
  sanitizeBlankCitationsInLatex,
} from "./thesis-citation-sanitize";

describe("sanitizeBlankCitationsInLatex", () => {
  it("replaces \\cite{} with marker when no upload keys", () => {
    const { text, replacementCount } = sanitizeBlankCitationsInLatex("See \\cite{} for details.");
    expect(text).toBe("See [citation needed] for details.");
    expect(replacementCount).toBe(1);
    expect(latexHasBlankCitationCommands(text)).toBe(false);
  });

  it("replaces \\citep{} and \\citet{}", () => {
    const { text, replacementCount } = sanitizeBlankCitationsInLatex("\\citep{} and \\citet{  }.");
    expect(text).toBe("[citation needed] and [citation needed].");
    expect(replacementCount).toBe(2);
  });

  it("replaces biblatex empty commands", () => {
    const { text, replacementCount } = sanitizeBlankCitationsInLatex("\\parencite{} \\textcite{} \\autocite{}");
    expect(replacementCount).toBe(3);
    expect(text).not.toMatch(/\\parencite\{\}/);
    expect(latexHasBlankCitationCommands(text)).toBe(false);
  });

  it("maps to single upload key when configured", () => {
    const { text } = sanitizeBlankCitationsInLatex("Empty \\citep{} here.", { uploadFallbackKeys: ["uploaded1"] });
    expect(text).toBe("Empty \\citep{uploaded1} here.");
    expect(latexHasBlankCitationCommands(text)).toBe(false);
  });

  it("leaves valid \\citep{uploaded1} unchanged", () => {
    const src = "Prior work \\citep{uploaded1,uploaded2} supports this.";
    const { text, replacementCount } = sanitizeBlankCitationsInLatex(src, { uploadFallbackKeys: ["uploaded1", "uploaded2"] });
    expect(text).toBe(src);
    expect(replacementCount).toBe(0);
  });

  it("removes only comma/space keys inside braces", () => {
    const { text, replacementCount } = sanitizeBlankCitationsInLatex("\\citep{ , , }");
    expect(replacementCount).toBe(1);
    expect(text).toBe("[citation needed]");
  });
});

describe("findBlankCitationHitsInText", () => {
  it("reports pattern and context for empty cite", () => {
    const hits = findBlankCitationHitsInText(
      "Lorem ipsum \\citep[p.~1]{} dolor sit.",
      "Literature review",
      1,
    );
    expect(hits.length).toBe(1);
    expect(hits[0].source).toBe("Literature review");
    expect(hits[0].chapterIndex).toBe(1);
    expect(hits[0].context).toContain("\\citep");
  });
});

describe("findBlankCitationHitsInCorpus", () => {
  it("aggregates abstract and chapters", () => {
    const hits = findBlankCitationHitsInCorpus({
      abstractLatex: "\\cite{}",
      chapters: [{ title: "Introduction", content: "\\parencite{}" }],
    });
    expect(hits.length).toBe(2);
  });
});
