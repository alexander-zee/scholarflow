import { describe, expect, it } from "vitest";
import { normalizeThesisTopicForGeneration } from "./thesis-topic-normalization";

describe("normalizeThesisTopicForGeneration", () => {
  it("rewrites gibberish inputs into coherent framing without throwing", () => {
    const n = normalizeThesisTopicForGeneration({
      title: "x",
      field: "n/a",
      researchQuestion: "asdf qqqqq",
      description: "",
      userPrompt: "hi",
      sourceCount: 0,
    });
    expect(n.title.length).toBeGreaterThan(8);
    expect(n.field.length).toBeGreaterThan(5);
    expect(n.researchQuestion.length).toBeGreaterThan(40);
    expect(n.topicWasNormalized).toBe(true);
    expect(n.warnings.length).toBeGreaterThan(0);
  });

  it("preserves solid user-provided fields", () => {
    const n = normalizeThesisTopicForGeneration({
      title: "Credit Constraints and Firm Investment",
      field: "Financial economics",
      researchQuestion: "How do credit supply shocks affect capital expenditure among small manufacturers?",
      description: "",
      userPrompt:
        "Focus on identification using regional banking shocks and panel data from manufacturing surveys.",
      sourceCount: 2,
    });
    expect(n.title).toContain("Credit");
    expect(n.topicWasNormalized).toBe(false);
    expect(n.warnings.length).toBe(0);
  });
});
