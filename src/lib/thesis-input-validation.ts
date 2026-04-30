export type ThesisInputValidationIssue = { code: string; message: string };

function wordCount(input: string) {
  return input.trim().split(/\s+/).filter(Boolean).length;
}

function lettersOnly(input: string) {
  return (input.match(/[a-zA-Z]/g) || []).join("");
}

/** Ratio of vowels among letters only (ASCII vowels). */
function vowelRatioLetters(input: string) {
  const letters = lettersOnly(input);
  if (!letters.length) return 0;
  const vowels = (letters.match(/[aeiouAEIOU]/g) || []).length;
  return vowels / letters.length;
}

export function looksPlaceholderThesisTitle(input: string) {
  return /^(thesis\s*title|title|untitled|new project|placeholder)$/i.test(input.trim());
}

/**
 * Single-token or very short titles that look like keyboard mash (e.g. "dasbj").
 * Multi-word academic titles usually pass vowel ratio.
 */
export function looksLowEntropyTitle(input: string) {
  const t = input.trim();
  if (t.length < 5 || t.length > 120) return false;
  const words = wordCount(t);
  const ratio = vowelRatioLetters(t);
  /* Single-token titles with unusually low vowel density are almost always junk (e.g. "dasasds"). */
  if (words === 1 && t.length <= 22 && ratio < 0.33) return true;
  if (words <= 2 && t.length >= 6 && ratio < 0.18) return true;
  return false;
}

/**
 * Letter-salad sentences (e.g. long RQ with no real words) fail vowel / word checks.
 */
export function looksLowEntropyResearchQuestion(input: string) {
  const t = input.trim();
  if (t.length < 12) return false;
  const letters = lettersOnly(t);
  if (letters.length < 12) return false;
  const ratio = vowelRatioLetters(t);
  const words = wordCount(t);
  if (words < 4) return true;
  if (words < 6 && t.length >= 28 && ratio < 0.2) return true;
  if (ratio < 0.16) return true;
  return false;
}

export function isUntrustedProjectTitle(title: string) {
  const t = title.trim();
  if (!t || t.length < 5) return true;
  if (looksPlaceholderThesisTitle(t)) return true;
  if (looksLowEntropyTitle(t)) return true;
  return false;
}

export function isUntrustedResearchQuestion(rq: string) {
  const t = rq.trim();
  if (t.length < 12) return true;
  if (wordCount(t) < 4) return true;
  if (looksLowEntropyResearchQuestion(t)) return true;
  return false;
}

/**
 * Pass 1: allow generation when user intent is meaningful OR sources are present,
 * while still rejecting obvious placeholder / gibberish inputs.
 */
export function validateThesisUserInputs(args: {
  title: string;
  field: string;
  researchQuestion: string;
  description?: string | null;
  userPrompt: string;
  sourceCount?: number;
}): ThesisInputValidationIssue[] {
  const issues: ThesisInputValidationIssue[] = [];
  const title = args.title.trim();
  const field = (args.field || "").trim();
  const rq = (args.researchQuestion || "").trim();
  const desc = (args.description || "").trim();
  const up = args.userPrompt.trim();
  const sources = Math.max(0, args.sourceCount || 0);
  const promptWords = wordCount(up);

  const nonsenseRe = /^(x+|test|aaa|asdf|foo|bar|todo|tbd|none\.?|n\/a\.?)$/i;
  const keyboardMash = /(.)\1{5,}/i;
  const shortWord = /^[^a-zA-Z]*$/;

  const validByPrompt = promptWords >= 8;
  const validByTitleAndSource = title.length >= 5 && sources >= 1;
  const validBySources = sources >= 3;
  const valid = validByPrompt || validByTitleAndSource || validBySources;

  if (!valid) {
    issues.push({
      code: "insufficient_inputs",
      message:
        "Provide either a meaningful prompt (>= 8 words), or a project title with at least one source, or at least three sources.",
    });
  }

  if (title && (nonsenseRe.test(title) || keyboardMash.test(title))) {
    issues.push({ code: "bad_title", message: "Project title looks like placeholder/gibberish." });
  }
  if (title && looksLowEntropyTitle(title)) {
    issues.push({
      code: "bad_title_entropy",
      message:
        "Project title looks like random characters. Use a clear thesis title (or leave the title blank so we infer one from your prompt).",
    });
  }
  if (field && nonsenseRe.test(field)) {
    issues.push({ code: "bad_field", message: "Field of study looks like a placeholder." });
  }
  if (rq && (shortWord.test(rq.replace(/\s+/g, " ")) || keyboardMash.test(rq))) {
    issues.push({ code: "bad_research_question", message: "Research question looks like nonsense." });
  } else if (rq && wordCount(rq) < 4) {
    issues.push({
      code: "bad_research_question",
      message:
        "Research question must be at least four meaningful words (a real question or hypothesis—not random text).",
    });
  } else if (rq && looksLowEntropyResearchQuestion(rq)) {
    issues.push({
      code: "bad_research_question",
      message:
        "Research question does not look like natural language. Rewrite it as a clear question about your topic.",
    });
  }
  if (desc.length > 0 && desc.length < 12 && nonsenseRe.test(desc)) {
    issues.push({ code: "bad_description", message: "Description looks like a placeholder." });
  }

  const garbage = [/awawadwd/i, /\basddd\b/i, /\blorem\s+ipsum\b/i];
  for (const re of garbage) {
    if (re.test(`${up} ${rq} ${title} ${desc}`)) {
      issues.push({
        code: "garbage_text",
        message: "Prompt or project text contains obvious placeholder/gibberish. Remove it and try again.",
      });
      break;
    }
  }

  return issues;
}
