import { describe, expect, it } from "vitest";
import {
  extractLargestMarkdownCodeFence,
  extractLatexDocumentBody,
  tryExtractStringFieldsFromJson,
  unwrapChapterLatexCandidate,
  sliceFromFirstChapterSection,
} from "./thesis-chapter-extract";

describe("unwrapChapterLatexCandidate", () => {
  it("extracts largest fenced LaTeX block", () => {
    const raw = 'Preamble\n```latex\n\\section{A}\nfirst\n```\nignore\n```\n\\section{B}\n' + "x".repeat(400) + "\n```";
    const u = unwrapChapterLatexCandidate(raw, { sliceFromPrimarySection: true });
    expect(u.text).toContain("\\section{B}");
    expect(u.text.length).toBeGreaterThan(300);
    expect(u.notes).toContain("unwrap_markdown_fence_largest");
  });

  it("parses JSON wrapper fields", () => {
    const latex = "\\section{Introduction}\n\\subsection{X}\nabc";
    const raw = JSON.stringify({ noise: 1, latex });
    const u = unwrapChapterLatexCandidate(raw, { sliceFromPrimarySection: false });
    expect(u.text).toContain("\\section{Introduction}");
    expect(u.notes).toContain("unwrap_json_field");
  });

  it("extracts document body and prefers Introduction section when present", () => {
    const raw = `\\documentclass{article}
\\begin{document}
Intro words.
\\section{Other}
Other.
\\section{Introduction}
Body here.
\\end{document}`;
    const u = unwrapChapterLatexCandidate(raw, { sliceFromPrimarySection: true });
    expect(u.notes).toContain("unwrap_latex_document_body");
    expect(u.text.startsWith("\\section{Introduction}")).toBe(true);
    expect(u.text).not.toContain("\\documentclass");
  });
});

describe("helpers", () => {
  it("extractLargestMarkdownCodeFence picks longest inner", () => {
    const inner = extractLargestMarkdownCodeFence("```a\nshort\n``` ... ```tex\nLONG\n" + "z".repeat(200) + "\n```");
    expect(inner?.includes("LONG")).toBe(true);
    expect(inner!.length).toBeGreaterThan(200);
  });

  it("sliceFromFirstChapterSection falls back to first section", () => {
    const s = "noise \\section{Lit Review}\nhere";
    expect(sliceFromFirstChapterSection(s).startsWith("\\section{Lit Review}")).toBe(true);
  });

  it("extractLatexDocumentBody no-ops without delimiters", () => {
    expect(extractLatexDocumentBody("\\section{X}")).toBe("\\section{X}");
  });

  it("tryExtractStringFieldsFromJson returns null for non-JSON", () => {
    expect(tryExtractStringFieldsFromJson("\\section{X}")).toBeNull();
  });
});
