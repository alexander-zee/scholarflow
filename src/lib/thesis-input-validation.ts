export type ThesisInputValidationIssue = { code: string; message: string };

/** Pass 1: reject obvious placeholder / nonsense inputs before expensive generation. */
export function validateThesisUserInputs(args: {
  title: string;
  field: string;
  researchQuestion: string;
  description?: string | null;
  userPrompt: string;
}): ThesisInputValidationIssue[] {
  const issues: ThesisInputValidationIssue[] = [];
  const title = args.title.trim();
  const field = args.field.trim();
  const rq = args.researchQuestion.trim();
  const desc = (args.description || "").trim();
  const up = args.userPrompt.trim();

  const nonsenseRe = /^(x+|test|aaa|asdf|foo|bar|todo|tbd|none\.?|n\/a\.?)$/i;
  const keyboardMash = /(.)\1{5,}/i;
  const shortWord = /^[^a-zA-Z]*$|[a-zA-Z]{1,2}\s*$/;

  if (title.length < 4 || nonsenseRe.test(title) || keyboardMash.test(title)) {
    issues.push({ code: "bad_title", message: "Project title looks empty, a test string, or placeholder. Set a real thesis title." });
  }
  if (field.length < 3 || nonsenseRe.test(field)) {
    issues.push({ code: "bad_field", message: "Field of study is missing or looks like a placeholder." });
  }
  if (rq.length < 15 || shortWord.test(rq.replace(/\s+/g, " ")) || keyboardMash.test(rq)) {
    issues.push({ code: "bad_research_question", message: "Research question is too short or looks like nonsense; refine it in project settings." });
  }
  if (desc.length > 0 && desc.length < 12 && nonsenseRe.test(desc)) {
    issues.push({ code: "bad_description", message: "Description looks like a placeholder; add a real project description or leave it empty." });
  }
  /** Common garbage substrings in prompts / pasted text */
  const garbage = [/awawadwd/i, /\basddd\b/i, /\blorem\s+ipsum\b/i];
  for (const re of garbage) {
    if (re.test(`${up} ${rq} ${title} ${desc}`)) {
      issues.push({ code: "garbage_text", message: "Prompt or project text contains obvious placeholder/gibberish. Remove it and try again." });
      break;
    }
  }

  return issues;
}
