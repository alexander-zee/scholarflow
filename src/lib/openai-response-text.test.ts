import { describe, expect, it } from "vitest";
import { extractResponsesOutputText } from "./openai-response-text";

describe("extractResponsesOutputText", () => {
  it("aggregates assistant message parts when top-level output_text is empty", () => {
    const body = "\\section{Introduction}\n\nSome prose here.";
    const response = {
      object: "response",
      status: "completed",
      output_text: "",
      output: [
        {
          type: "message",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: body, annotations: [] }],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 42, total_tokens: 52 },
    };
    const ex = extractResponsesOutputText(response);
    expect(ex.text).toBe(body);
    expect(ex.preTrimSourceCharLength).toBe(body.length);
    expect(ex.rawTextPreview1000.startsWith("\\section{Introduction}")).toBe(true);
    expect(ex.usage?.output_tokens).toBe(42);
  });

  it("accepts camelCase usage fields", () => {
    const response = {
      output_text: "ok",
      output: [],
      usage: { inputTokens: 3, outputTokens: 9, totalTokens: 12 },
    };
    const ex = extractResponsesOutputText(response);
    expect(ex.text).toBe("ok");
    expect(ex.usage?.input_tokens).toBe(3);
    expect(ex.usage?.output_tokens).toBe(9);
    expect(ex.usage?.total_tokens).toBe(12);
  });

  it("reads output_text property on content blocks when text field differs", () => {
    const response = {
      output_text: "",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", output_text: "\\section{X}", annotations: [] }],
        },
      ],
    };
    expect(extractResponsesOutputText(response).text).toBe("\\section{X}");
  });

  it("reads type=text content blocks", () => {
    const response = {
      output_text: "",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "hello" }],
        },
      ],
    };
    expect(extractResponsesOutputText(response).text).toBe("hello");
  });

  it("falls back to reasoning summary when assistant message is empty", () => {
    const response = {
      output_text: "",
      output: [
        {
          type: "reasoning",
          id: "r1",
          summary: [{ type: "summary_text", text: "\\section{Introduction}\nProof sketch…" }],
        },
      ],
    };
    const ex = extractResponsesOutputText(response);
    expect(ex.usedReasoningFallback).toBe(true);
    expect(ex.text).toContain("\\section{Introduction}");
  });
});
