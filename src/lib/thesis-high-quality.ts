/**
 * Multi-pass thesis generation (higher token budgets, blueprint pass, deeper repairs).
 * The full-draft API defaults `highQualityThesis` to true; set `{ "highQualityThesis": false }` to opt out.
 * Also triggers on prompt token `HIGH_QUALITY_THESIS` or env `SCHOLARFLOW_HIGH_QUALITY_THESIS=1`.
 */
export const HIGH_QUALITY_THESIS_PROMPT_TOKEN = "HIGH_QUALITY_THESIS";

export function detectHighQualityThesisMode(args: {
  highQualityFlag?: boolean;
  prompt: string;
  envValue?: string | undefined;
}): boolean {
  if (args.highQualityFlag === true) return true;
  const env = (args.envValue ?? process.env.SCHOLARFLOW_HIGH_QUALITY_THESIS)?.trim().toLowerCase();
  if (env && /^(1|true|yes|on)$/i.test(env)) return true;
  return args.prompt.includes(HIGH_QUALITY_THESIS_PROMPT_TOKEN);
}

export const HQ_SECTION_MAX_TOKENS = 6000;
export const HQ_SECTION_DEEP_TOKENS = 8000;
export const HQ_ABSTRACT_TOKENS = 1400;
export const HQ_SKELETON_TOKENS = 1400;
export const HQ_QUALITY_REPAIR_TOKENS = 4500;
export const HQ_DEDUPE_TOKENS = 3500;
export const HQ_FIGURE_TABLE_PASS_TOKENS = 4500;
export const HQ_BLUEPRINT_TOKENS = 2400;
export const HQ_MAX_QUALITY_ROUNDS = 4;
export const HQ_MIN_FIGURES_TECHNICAL = 5;
export const HQ_MIN_TABLES_TECHNICAL = 3;
