export type ThesisInputValidationIssue = { code: string; message: string };

function wordCount(input: string) {
  return input.trim().split(/\s+/).filter(Boolean).length;
}

type ValidationArgs = {
  title: string;
  field: string;
  researchQuestion: string;
  description?: string | null;
  userPrompt: string;
  sourceCount?: number;
};

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
  if (field && nonsenseRe.test(field)) {
    issues.push({ code: "bad_field", message: "Field of study looks like a placeholder." });
  }
  if (rq && (shortWord.test(rq.replace(/\s+/g, " ")) || keyboardMash.test(rq))) {
    issues.push({ code: "bad_research_question", message: "Research question looks like nonsense." });
  }
  if (desc.length > 0 && desc.length < 12 && nonsenseRe.test(desc)) {
    issues.push({ code: "bad_description", message: "Description looks like a placeholder." });
  }

  const garbage = [/awawadwd/i, /\basddd\b/i, /\blorem\s+ipsum\b/i];
  for (const re of garbage) {
    if (re.test(`${up} ${rq} ${title} ${desc}`)) {
      issues.push({ code: "garbage_text", message: "Prompt or project text contains obvious placeholder/gibberish. Remove it and try again." });
      break;
    }
  }

  return issues;
}
