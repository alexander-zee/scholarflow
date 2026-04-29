import { z } from "zod";

/** v1 structured supervisor payload returned by `/api/supervisor-chat`. */
export const supervisorActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("COMMENT"),
    id: z.string().min(1).max(64),
    message: z.string().min(1).max(4000),
    anchor_snippet: z.string().min(8).max(1200).optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
  }),
  z.object({
    type: z.literal("HIGHLIGHT"),
    id: z.string().min(1).max(64),
    anchor_snippet: z.string().min(8).max(1200),
    label: z.string().max(240).optional(),
  }),
  z.object({
    type: z.literal("SCROLL_TO"),
    id: z.string().min(1).max(64),
    anchor_snippet: z.string().min(8).max(1200),
  }),
  z.object({
    type: z.literal("SUGGEST_EDIT"),
    id: z.string().min(1).max(64),
    anchor_snippet: z.string().min(8).max(1200),
    replacement: z.string().max(12000),
    rationale: z.string().min(1).max(4000),
  }),
  z.object({
    type: z.literal("SUGGEST_FORMULA"),
    id: z.string().min(1).max(64),
    anchor_snippet: z.string().min(8).max(1200).optional(),
    formula_latex: z.string().min(1).max(4000),
    note: z.string().max(2000).optional(),
  }),
  z.object({
    type: z.literal("SUGGEST_FIGURE"),
    id: z.string().min(1).max(64),
    anchor_snippet: z.string().min(8).max(1200).optional(),
    figure_type: z.enum(["plot", "table", "diagram"]),
    spec: z.string().min(1).max(8000),
    vega_lite_json: z.string().max(12000).optional(),
  }),
  z.object({
    type: z.literal("ASK_CLARIFICATION"),
    id: z.string().min(1).max(64),
    question: z.string().min(1).max(2000),
  }),
  z.object({
    type: z.literal("PRIORITY_FIX"),
    id: z.string().min(1).max(64),
    title: z.string().min(1).max(400),
    details: z.string().min(1).max(4000),
    anchor_snippet: z.string().min(8).max(1200).optional(),
  }),
  z.object({
    type: z.literal("SCHOLAR_SEARCH"),
    id: z.string().min(1).max(64),
    query: z.string().min(1).max(400),
    reason: z.string().max(1200).optional(),
  }),
]);

export const supervisorPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  reply_markdown: z.string().min(1).max(24000),
  integrity_reminder: z.string().max(1200).optional(),
  actions: z.array(supervisorActionSchema).max(24),
});

export const graphTableProposalSchema = z.object({
  type: z.enum(["table", "figure"]),
  title: z.string().min(3).max(240),
  caption: z.string().min(3).max(500),
  label: z.string().min(3).max(120),
  targetSection: z.string().min(3).max(200),
  insertAfterText: z.string().min(8).max(1200),
  latexBlock: z.string().min(24).max(12000),
  reason: z.string().min(8).max(1200),
});

export type SupervisorPayload = z.infer<typeof supervisorPayloadSchema>;
export type SupervisorAction = z.infer<typeof supervisorActionSchema>;
export type GraphTableProposal = z.infer<typeof graphTableProposalSchema>;

export function extractJsonObject(raw: string): string | null {
  const t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) return t.slice(start, end + 1);
  return null;
}

export function parseSupervisorPayload(raw: string): SupervisorPayload | null {
  const jsonText = extractJsonObject(raw);
  if (!jsonText) return null;
  try {
    const obj = JSON.parse(jsonText) as unknown;
    const parsed = supervisorPayloadSchema.safeParse(obj);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function parseGraphTableProposal(raw: string): GraphTableProposal | null {
  const jsonText = extractJsonObject(raw);
  if (!jsonText) return null;
  try {
    const obj = JSON.parse(jsonText) as unknown;
    const parsed = graphTableProposalSchema.safeParse(obj);
    if (!parsed.success) return null;
    const block = parsed.data.latexBlock.trim();
    if (!/\\begin\{(?:table|figure)\}/.test(block)) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
