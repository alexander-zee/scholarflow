import { z } from "zod";

export const thesisWorkspaceGenerationSettingsSchema = z.object({
  pages: z.number().int().min(10).max(120),
  citationStyle: z.enum(["APA", "IEEE", "Chicago", "Harvard", "MLA"]),
  citationLevel: z.enum(["Light", "Standard", "Strict"]),
  citationCoveragePercent: z.number().int().min(5).max(100),
  documentLanguage: z.string().trim().min(2).max(80),
  notifyOnComplete: z.boolean(),
  semanticFieldBoost: z.array(z.string().trim().min(2)).max(24).optional(),
});

export type ThesisWorkspaceGenerationSettings = z.infer<typeof thesisWorkspaceGenerationSettingsSchema>;

const DEFAULT_SETTINGS: ThesisWorkspaceGenerationSettings = {
  pages: 20,
  citationStyle: "APA",
  citationLevel: "Standard",
  citationCoveragePercent: 50,
  documentLanguage: "English",
  notifyOnComplete: false,
};

/**
 * Workspace sidebar values are cosmetic; outline/full-draft/export always use this profile
 * (40 pages ± product copy, APA, Standard, 50% coverage, English, no completion email).
 */
export const THESIS_PIPELINE_FIXED_SETTINGS: ThesisWorkspaceGenerationSettings = {
  /** Product target: ~30–40 pages; ~35 as default budget for chapter word allocation. */
  pages: 35,
  citationStyle: "APA",
  citationLevel: "Standard",
  citationCoveragePercent: 50,
  documentLanguage: "English",
  notifyOnComplete: false,
};

export function parseThesisWorkspaceGenerationSettings(raw: unknown): ThesisWorkspaceGenerationSettings | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = thesisWorkspaceGenerationSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...(raw as object) });
  return parsed.success ? parsed.data : null;
}

export const thesisWorkspaceRequestSchema = z.object({
  prompt: z.string().min(8),
  generationSettings: thesisWorkspaceGenerationSettingsSchema.optional(),
});

export type ThesisWorkspaceRequest = z.infer<typeof thesisWorkspaceRequestSchema>;

export function resolveThesisWorkspaceRequest(data: ThesisWorkspaceRequest): {
  researchPrompt: string;
  generationSettings: ThesisWorkspaceGenerationSettings | null;
  composedModelPrompt: string;
} {
  if (data.generationSettings) {
    const settings = thesisWorkspaceGenerationSettingsSchema.parse({ ...DEFAULT_SETTINGS, ...data.generationSettings });
    const researchPrompt = data.prompt.trim();
    return {
      researchPrompt,
      generationSettings: settings,
      composedModelPrompt: composeWorkspaceModelPrompt(researchPrompt, settings),
    };
  }
  const legacy = data.prompt.trim();
  return {
    researchPrompt: extractResearchPromptFromLegacyComposedPrompt(legacy),
    generationSettings: null,
    composedModelPrompt: legacy,
  };
}

/** Legacy clients sent one string: research text + optional UI block. Strip the UI tail for inference. */
export function extractResearchPromptFromLegacyComposedPrompt(legacyPrompt: string): string {
  const marker = /\n\s*Pages\s*\(UI setting\)\s*:/i;
  const match = legacyPrompt.match(marker);
  if (!match || match.index == null) return legacyPrompt.trim();
  return legacyPrompt.slice(0, match.index).trim();
}

export function composeWorkspaceModelPrompt(
  researchPrompt: string,
  settings: ThesisWorkspaceGenerationSettings,
): string {
  const rp = researchPrompt.trim();
  const sem =
    settings.semanticFieldBoost && settings.semanticFieldBoost.length > 0
      ? `Academic search field boost (UI): ${[...settings.semanticFieldBoost].sort().join(", ")}`
      : "";
  const coverageLabel =
    settings.citationCoveragePercent < 35 ? "Narrow" : settings.citationCoveragePercent < 70 ? "Balanced" : "Broad";
  const settingsBlock = [
    `Pages (UI setting): ${settings.pages}`,
    `Citation style (UI setting): ${settings.citationStyle}`,
    `Citation level (UI setting): ${settings.citationLevel}`,
    `Citation coverage (UI setting): ${coverageLabel} (${settings.citationCoveragePercent}%)`,
    `Document language (UI setting): ${settings.documentLanguage}`,
    `Email on completion (UI setting): ${settings.notifyOnComplete ? "yes" : "no"}`,
  ].join("\n");
  return [rp, sem, settingsBlock].filter(Boolean).join("\n\n").trim();
}

export function pickTargetPagesFromWorkspace(
  legacyOrComposedPrompt: string,
  settings: ThesisWorkspaceGenerationSettings | null,
): number {
  if (settings) return Math.min(120, Math.max(10, settings.pages));
  const match = legacyOrComposedPrompt.match(/Pages\s*\(UI setting\)\s*:\s*(\d{1,3})/i);
  if (!match) return 40;
  const value = Number.parseInt(match[1], 10);
  if (!Number.isFinite(value)) return 40;
  return Math.min(120, Math.max(10, value));
}

export function buildWorkspacePolicyInstructions(settings: ThesisWorkspaceGenerationSettings | null): string {
  if (!settings) return "";
  const coverage = settings.citationCoveragePercent;
  const coverageHint =
    coverage < 35
      ? "Aim for citations in roughly one quarter of substantive paragraphs where references support claims."
      : coverage < 70
        ? "Aim for citations in roughly half of substantive paragraphs where references support claims."
        : "Aim for citations in most substantive paragraphs where references support claims (still avoid cite-stuffing).";

  const levelHint =
    settings.citationLevel === "Light"
      ? "Citation strictness: light — cite major claims and direct empirical statements; narrative synthesis may stand without a cite when appropriate."
      : settings.citationLevel === "Strict"
        ? "Citation strictness: strict — every non-trivial empirical, definitional, or literature claim should carry an uploaded-source cite (or [citation needed] if impossible)."
        : "Citation strictness: standard — cite claims that rest on prior work or uploaded evidence; avoid uncited factual assertions.";

  const styleHint =
    settings.citationStyle === "IEEE"
      ? "Citation style: IEEE-like numeric referencing — prefer bracket numbers [1], [2] aligned with uploaded source order when appropriate, and still use \\citep{uploadedN} where the pipeline requires natbib keys."
      : settings.citationStyle === "MLA"
        ? "Citation style: MLA-like — prefer narrative attribution with \\citet{uploadedN} where natural; keep keys within the uploaded set only."
        : settings.citationStyle === "Chicago" || settings.citationStyle === "Harvard"
          ? `Citation style: ${settings.citationStyle} (author–date tone) — prefer \\citet{uploadedN} for integrated attribution and \\citep{uploadedN} for parenthetical support; never invent keys outside uploaded sources.`
          : "Citation style: APA-like author–date tone — prefer \\citet{uploadedN} for integrated attribution and \\citep{uploadedN} for parenthetical support; never invent keys outside uploaded sources.";

  const langHint = `Write the thesis body in ${settings.documentLanguage} (match tone, connectors, and section phrasing appropriate to that language).`;

  return [
    "WORKSPACE GENERATION SETTINGS (must follow — these are user-controlled product settings):",
    `- Target length is driven by Pages (UI setting) in the composed prompt; do not ignore it.`,
    styleHint,
    levelHint,
    coverageHint,
    langHint,
    settings.notifyOnComplete
      ? "The user requested email on completion — still produce the thesis normally; do not mention email or product internals in the thesis text."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export type NatbibExportProfile = {
  natbibOptions: string;
  bibliographystyle: string;
};

export function natbibExportProfileForCitationStyle(style: ThesisWorkspaceGenerationSettings["citationStyle"]): NatbibExportProfile {
  switch (style) {
    case "IEEE":
      return { natbibOptions: "numbers,sort&compress", bibliographystyle: "unsrtnat" };
    case "Harvard":
      return { natbibOptions: "round,authoryear", bibliographystyle: "agsm" };
    case "Chicago":
      return { natbibOptions: "round,authoryear", bibliographystyle: "chicago" };
    case "MLA":
      return { natbibOptions: "round,authoryear", bibliographystyle: "plainnat" };
    case "APA":
    default:
      return { natbibOptions: "round,authoryear", bibliographystyle: "apalike" };
  }
}
