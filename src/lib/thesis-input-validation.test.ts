import { describe, expect, it } from "vitest";
import {
  isUntrustedProjectTitle,
  isUntrustedResearchQuestion,
  looksLowEntropyResearchQuestion,
  looksLowEntropyTitle,
  validateThesisUserInputs,
} from "./thesis-input-validation";

describe("looksLowEntropyTitle", () => {
  it("flags single-token keyboard-ish titles", () => {
    expect(looksLowEntropyTitle("dasbj")).toBe(true);
    expect(looksLowEntropyTitle("qxqxqxqx")).toBe(true);
  });

  it("allows normal titles", () => {
    expect(looksLowEntropyTitle("Machine Learning in Healthcare")).toBe(false);
    expect(looksLowEntropyTitle("Trade Policy and Rural Poverty")).toBe(false);
  });
});

describe("isUntrustedResearchQuestion", () => {
  it("rejects short or salad RQ", () => {
    expect(isUntrustedResearchQuestion("dasbjdasbjdas")).toBe(true);
    expect(isUntrustedResearchQuestion("how why when")).toBe(true);
    expect(isUntrustedResearchQuestion("")).toBe(true);
  });

  it("accepts a real sentence", () => {
    const rq =
      "How does exposure to digital trade platforms affect smallholder farmers' access to regional markets in Southeast Asia?";
    expect(isUntrustedResearchQuestion(rq)).toBe(false);
    expect(looksLowEntropyResearchQuestion(rq)).toBe(false);
  });
});

describe("validateThesisUserInputs", () => {
  it("returns bad_title_entropy for low-entropy title (e.g. admin or future callers)", () => {
    const issues = validateThesisUserInputs({
      title: "dasbj",
      field: "Economics",
      researchQuestion:
        "How does exposure to digital trade platforms affect smallholder farmers' access to regional markets?",
      description: "",
      userPrompt: "one two three four five six seven eight nine",
      sourceCount: 0,
    });
    expect(issues.some((i) => i.code === "bad_title_entropy")).toBe(true);
  });

  it("returns bad_research_question for letter-salad RQ", () => {
    const issues = validateThesisUserInputs({
      title: "Solid Thesis on Trade",
      field: "Economics",
      researchQuestion: "dasbjdasbjdasbjdasbjdasbjdasbjdasbj",
      description: "",
      userPrompt: "one two three four five six seven eight nine",
      sourceCount: 0,
    });
    expect(issues.some((i) => i.code === "bad_research_question")).toBe(true);
  });
});
