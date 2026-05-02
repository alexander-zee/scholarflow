/**
 * Normalize OpenAI Responses API payloads — `output_text` may be empty while
 * assistant `message` items still carry `output_text` parts.
 */

export type OpenAiResponseUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
};

export type ExtractedResponseText = {
  text: string;
  refusalSummaries: string[];
  status?: string;
  incompleteReason?: string;
  usage?: OpenAiResponseUsage;
  /** Max length among top-level `output_text` and aggregated message parts (before final trim). */
  preTrimSourceCharLength: number;
  /** First 1000 chars of the selected raw body before `.trim()` (for server logs). */
  rawTextPreview1000: string;
  /** True when visible assistant text came from a reasoning item (token usage can be non-zero while `output_text` is empty). */
  usedReasoningFallback?: boolean;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function blockAssistantText(block: Record<string, unknown>): string | null {
  if (typeof block.output_text === "string") return block.output_text;
  const t = block.type;
  if (typeof block.text !== "string") return null;
  if (t === "output_text" || t === "text") return block.text;
  return null;
}

function collectMessageOutputText(output: unknown): { parts: string[]; refusals: string[] } {
  const parts: string[] = [];
  const refusals: string[] = [];
  if (!Array.isArray(output)) return { parts, refusals };

  for (const item of output) {
    if (!isRecord(item)) continue;
    const isMessage = item.type === "message" || item.role === "assistant";
    if (!isMessage) continue;
    const content = item.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!isRecord(block)) continue;
      const txt = blockAssistantText(block);
      if (txt) parts.push(txt);
      if (block.type === "refusal") {
        const r = block.refusal ?? block.summary ?? block.message;
        if (typeof r === "string") refusals.push(r);
      }
    }
  }
  return { parts, refusals };
}

function collectReasoningOutputText(output: unknown): string {
  if (!Array.isArray(output)) return "";
  const chunks: string[] = [];
  for (const item of output) {
    if (!isRecord(item) || item.type !== "reasoning") continue;
    const summary = item.summary;
    if (Array.isArray(summary)) {
      for (const part of summary) {
        if (isRecord(part) && typeof part.text === "string") chunks.push(part.text);
      }
    }
    const content = item.content;
    if (Array.isArray(content)) {
      for (const part of content) {
        if (isRecord(part) && typeof part.text === "string") chunks.push(part.text);
      }
    }
  }
  return chunks.join("\n\n");
}

/**
 * Extract assistant-visible text from a `responses.create` result.
 */
export function extractResponsesOutputText(response: unknown): ExtractedResponseText {
  if (!isRecord(response)) {
    return { text: "", refusalSummaries: [], preTrimSourceCharLength: 0, rawTextPreview1000: "" };
  }

  let chosen = typeof response.output_text === "string" ? response.output_text : "";
  const { parts, refusals } = collectMessageOutputText(response.output);
  const joined = parts.join("");
  let preTrimSourceCharLength = Math.max(chosen.length, joined.length);
  if (!chosen.trim() && joined.trim()) {
    chosen = joined;
  } else if (joined.trim().length > chosen.trim().length) {
    chosen = joined;
  }

  let usedReasoningFallback = false;
  if (!chosen.trim()) {
    const reasoning = collectReasoningOutputText(response.output);
    if (reasoning.trim()) {
      chosen = reasoning;
      usedReasoningFallback = true;
    }
  }
  preTrimSourceCharLength = Math.max(preTrimSourceCharLength, chosen.length);

  const usageRaw = response.usage;
  let usage: OpenAiResponseUsage | undefined;
  if (isRecord(usageRaw)) {
    const inTok =
      (typeof usageRaw.input_tokens === "number" ? usageRaw.input_tokens : undefined) ??
      (typeof usageRaw.inputTokens === "number" ? usageRaw.inputTokens : undefined);
    const outTok =
      (typeof usageRaw.output_tokens === "number" ? usageRaw.output_tokens : undefined) ??
      (typeof usageRaw.outputTokens === "number" ? usageRaw.outputTokens : undefined) ??
      (typeof usageRaw.completion_tokens === "number" ? usageRaw.completion_tokens : undefined) ??
      (typeof usageRaw.completionTokens === "number" ? usageRaw.completionTokens : undefined);
    const totTok =
      (typeof usageRaw.total_tokens === "number" ? usageRaw.total_tokens : undefined) ??
      (typeof usageRaw.totalTokens === "number" ? usageRaw.totalTokens : undefined);
    usage = {
      input_tokens: inTok,
      output_tokens: outTok,
      total_tokens: totTok,
    };
  }

  const status = typeof response.status === "string" ? response.status : undefined;
  let incompleteReason: string | undefined;
  const inc = response.incomplete_details;
  if (isRecord(inc) && typeof inc.reason === "string") {
    incompleteReason = inc.reason;
  }

  return {
    text: chosen.trim(),
    refusalSummaries: refusals,
    status,
    incompleteReason,
    usage,
    preTrimSourceCharLength,
    rawTextPreview1000: chosen.slice(0, 1000),
    usedReasoningFallback,
  };
}

/** Safe summary for server logs (production debugging); avoids dumping huge payloads. */
export function summarizeOpenAiResponseForLog(response: unknown): Record<string, unknown> {
  if (!isRecord(response)) {
    return { shape: "non_object" };
  }
  const out = response.output;
  const outputSummary = Array.isArray(out)
    ? out.map((item, i) => {
        if (!isRecord(item)) return { i, kind: "unknown" };
        const content = item.content;
        const contentKinds = Array.isArray(content)
          ? content.map((c) => (isRecord(c) ? String(c.type ?? "?") : "?"))
          : [];
        return {
          i,
          type: item.type,
          role: item.role,
          status: item.status,
          contentBlockTypes: contentKinds,
        };
      })
    : { raw: typeof out };
  const ot = response.output_text;
  return {
    id: response.id,
    status: response.status,
    output_text_length: typeof ot === "string" ? ot.length : 0,
    output_length: Array.isArray(out) ? out.length : 0,
    output: outputSummary,
    usage: response.usage,
    incomplete_details: response.incomplete_details,
    error: response.error,
  };
}
