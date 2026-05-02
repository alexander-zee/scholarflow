/**
 * User-facing thesis fields are guidance only: normalize weak or gibberish input into
 * a coherent internal framing without blocking generation.
 */

import {
  looksLowEntropyResearchQuestion,
  looksLowEntropyTitle,
  looksPlaceholderThesisTitle,
} from "@/lib/thesis-input-validation";

function wordCount(input: string): number {
  return input.trim().split(/\s+/).filter(Boolean).length;
}

function toTitleCase(input: string): string {
  return input
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
    .slice(0, 120);
}

function inferSyntheticTitleFromTopic(topic: string): string {
  const firstLine = topic.split(/[.\n]/)[0]?.trim() ?? topic;
  const t = toTitleCase(firstLine);
  if (t.length >= 10) return `Essays on ${t}`.slice(0, 120);
  return "Empirical Evidence and Methods in Applied Research";
}

function buildSyntheticResearchQuestion(topicPhrase: string, title: string): string {
  const tp = topicPhrase.trim().slice(0, 160) || title.slice(0, 80);
  return (
    `How can empirical evidence and transparent identification discipline inform inference about mechanisms and magnitudes in ${tp}, ` +
    `and what are the main threats to validity when translating estimates into substantive conclusions?`
  );
}

export type NormalizedThesisTopic = {
  title: string;
  field: string;
  researchQuestion: string;
  /** True when any field was rewritten from weak user input. */
  topicWasNormalized: boolean;
  /** Diagnostic codes for logs (not shown as hard errors). */
  warnings: string[];
};

/**
 * Always returns usable title, field, and research question for thesis generation.
 */
export function normalizeThesisTopicForGeneration(args: {
  title: string;
  field: string;
  researchQuestion: string;
  description?: string | null;
  userPrompt: string;
  sourceCount: number;
}): NormalizedThesisTopic {
  const warnings: string[] = [];
  let topicWasNormalized = false;

  const promptTrim = args.userPrompt.trim();
  const pw = wordCount(promptTrim);

  let topicPhrase =
    pw >= 4
      ? promptTrim.replace(/[.?!]+$/, "").slice(0, 520)
      : args.title.trim().length >= 8 && !looksPlaceholderThesisTitle(args.title) && !looksLowEntropyTitle(args.title)
        ? args.title.trim()
        : "applied empirical research linking measurement, theory, and policy-relevant magnitudes";

  if (pw > 0 && pw < 4) {
    topicPhrase = promptTrim.slice(0, 520);
    topicWasNormalized = true;
    warnings.push("prompt_short_used_as_topic_seed");
  }

  let title = args.title.trim();
  if (!title || title.length < 5 || looksPlaceholderThesisTitle(title) || looksLowEntropyTitle(title)) {
    title = inferSyntheticTitleFromTopic(topicPhrase);
    topicWasNormalized = true;
    warnings.push("title_inferred");
  }

  let field = args.field.trim();
  if (!field || field.length < 3 || /^(none\.?|n\/a\.?|test|todo|tbd)$/i.test(field)) {
    field = "Econometrics and applied social science";
    topicWasNormalized = true;
    warnings.push("field_defaulted");
  }

  let researchQuestion = args.researchQuestion.trim();
  if (
    researchQuestion.length < 16 ||
    wordCount(researchQuestion) < 5 ||
    looksLowEntropyResearchQuestion(researchQuestion)
  ) {
    researchQuestion = buildSyntheticResearchQuestion(topicPhrase, title);
    topicWasNormalized = true;
    warnings.push("research_question_rewritten");
  }

  const desc = (args.description || "").trim();
  if (desc.length > 0 && desc.length < 8 && /^(x+|test|aaa)$/i.test(desc)) {
    topicWasNormalized = true;
    warnings.push("description_ignored_placeholder");
  }

  return {
    title,
    field,
    researchQuestion,
    topicWasNormalized,
    warnings,
  };
}
