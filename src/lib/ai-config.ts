import type { ReviewMode } from "@/lib/review-modes";

const DEFAULT_INPUT_CHAR_LIMIT = 350000;
const DEFAULT_INPUT_WORD_LIMIT = 50000;
const DEFAULT_MODEL = "gpt-4.1-mini";
const DEFAULT_FALLBACK_MODEL = "gpt-4o-mini";

const modeTokenCaps: Record<ReviewMode, number> = {
  full_review: 1100,
  structure_feedback: 700,
  academic_tone: 650,
  methodology_check: 800,
  rewrite_suggestions: 900,
  supervisor_comments: 800,
  research_question_check: 650,
};

function parseIntEnv(name: string, fallback: number) {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function getInputCharLimit() {
  return parseIntEnv("AI_INPUT_CHAR_LIMIT", DEFAULT_INPUT_CHAR_LIMIT);
}

export function getInputWordLimit() {
  return parseIntEnv("AI_INPUT_WORD_LIMIT", DEFAULT_INPUT_WORD_LIMIT);
}

export function countWords(input: string) {
  return input.trim().split(/\s+/).filter(Boolean).length;
}

export function getModel() {
  return process.env.OPENAI_MODEL || DEFAULT_MODEL;
}

export function getFallbackModel() {
  return process.env.OPENAI_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL;
}

export function getOutputTokenCap(mode: ReviewMode) {
  return modeTokenCaps[mode];
}
