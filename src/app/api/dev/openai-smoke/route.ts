import { NextResponse } from "next/server";
import { getModel } from "@/lib/ai-config";
import { openai } from "@/lib/openai";
import { extractResponsesOutputText } from "@/lib/openai-response-text";

const SMOKE_PROMPT = String.raw`Write a LaTeX section called \section{Introduction} with one paragraph.`;

function thesisDraftTemperatureFromEnv(): number {
  const raw = process.env.SCHOLARFLOW_THESIS_TEMPERATURE;
  if (!raw?.trim()) return 0.48;
  const t = Number.parseFloat(raw);
  return Number.isFinite(t) ? Math.min(0.78, Math.max(0.05, t)) : 0.48;
}

/**
 * Dev-only OpenAI Responses smoke test (same client + extractor as thesis drafting).
 */
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available outside development." }, { status: 404 });
  }

  const model = getModel();
  const temperature = thesisDraftTemperatureFromEnv();

  const response = await openai.responses.create({
    model,
    input: SMOKE_PROMPT,
    max_output_tokens: 2048,
    temperature,
  });

  const extracted = extractResponsesOutputText(response);
  const rawResponseChars = JSON.stringify(response).length;
  const extractedTextChars = extracted.text.length;

  const logLine = {
    tag: "openai-smoke",
    model,
    temperature,
    rawResponseChars,
    extractedTextChars,
    usedReasoningFallback: extracted.usedReasoningFallback ?? false,
    responseStatus: extracted.status,
  };
  console.log(JSON.stringify(logLine));

  return NextResponse.json({
    model,
    temperature,
    rawResponseChars,
    extractedTextChars,
    usedReasoningFallback: extracted.usedReasoningFallback ?? false,
    preview: extracted.text.slice(0, 400),
  });
}
