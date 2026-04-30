import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";
import {
  ensureSupervisorSuggestionAllowed,
  ensureUsageAllowed,
  incrementSupervisorSuggestionUsage,
  incrementUsage,
} from "@/lib/usage";
import { getFallbackModel, getModel } from "@/lib/ai-config";
import {
  parseGraphTableProposal,
  parseSupervisorPayload,
  type GraphTableProposal,
  type SupervisorPayload,
} from "@/lib/supervisor-schema";
import { semanticScholarSearch } from "@/lib/semantic-scholar";

const requestSchema = z.object({
  projectId: z.string().min(1),
  question: z.string().min(4).max(8000),
  draftText: z.string().min(20),
  selectedText: z.string().optional(),
  suggestionType: z.enum(["table", "figure"]).optional(),
  /** `single_suggestion` = one guided SUGGEST_EDIT for the walkthrough UI. */
  supervisorInteraction: z.enum(["chat", "single_suggestion", "figure_proposal"]).optional().default("chat"),
  chatHistory: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      }),
    )
    .max(16)
    .optional(),
});

const MAX_DRAFT_CONTEXT_CHARS = 28000;
const CHAT_MAX_OUTPUT_TOKENS = 7000;
const CHAT_JSON_RETRY_TOKENS = 2600;
const CHAT_SINGLE_SUGGESTION_TOKENS = 3200;
const CHAT_FIGURE_PROPOSAL_TOKENS = 3000;
const CHAT_DELIBERATION_TOKENS = 3600;
const MAX_FIGURE_PROPOSAL_ATTEMPTS = 3;

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

function scorePassage(questionTokens: Set<string>, passage: string) {
  if (!passage.trim()) return 0;
  const words = tokenize(passage);
  if (words.length === 0) return 0;
  let hits = 0;
  for (const w of words) {
    if (questionTokens.has(w)) hits += 1;
  }
  const density = hits / Math.max(words.length, 1);
  const hitBoost = Math.min(hits, 10) * 2;
  return hitBoost + density * 100;
}

function buildContext(draftText: string, question: string, selectedText?: string) {
  const selection = (selectedText || "").trim();
  if (selection.length >= 20) {
    return `Selected passage:\n${selection.slice(0, 8000)}`;
  }
  const trimmed = draftText.trim().replace(/\r\n/g, "\n");
  if (trimmed.length <= MAX_DRAFT_CONTEXT_CHARS) return trimmed;

  const questionTokens = new Set(tokenize(question));
  const passages = trimmed
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 40);
  if (passages.length === 0) return trimmed.slice(0, MAX_DRAFT_CONTEXT_CHARS);

  const scored = passages
    .map((p, idx) => ({ idx, p, score: scorePassage(questionTokens, p) }))
    .sort((a, b) => b.score - a.score || a.idx - b.idx);

  const chosen: string[] = [];
  const add = (label: string, text: string) => {
    if (!text || chosen.some((c) => c.includes(text.slice(0, 80)))) return;
    chosen.push(`${label}\n${text}`);
  };

  add("Opening context:", passages[0]?.slice(0, 1200) || "");
  for (const item of scored.slice(0, 8)) {
    add(`Relevant passage ${item.idx + 1}:`, item.p.slice(0, 3200));
  }
  add("Closing context:", passages[passages.length - 1]?.slice(-1200) || "");

  const packed = chosen.join("\n\n");
  return packed.length > MAX_DRAFT_CONTEXT_CHARS ? packed.slice(0, MAX_DRAFT_CONTEXT_CHARS) : packed;
}

function sanitizeLegacyAnswer(raw: string) {
  return raw
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeForCompare(text: string) {
  return text
    .toLowerCase()
    .replace(/\\[a-zA-Z]+\*?(\{[^}]*\})?/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeForCompare(text: string) {
  return normalizeForCompare(text)
    .split(" ")
    .filter((t) => t.length >= 3);
}

function bestDraftSnippetForEvidence(draftText: string, evidenceLine: string) {
  const cleanLine = evidenceLine
    .replace(/^[-*•]\s*/, "")
    .replace(/\s*\((passage|para|paragraph|section)\s*\d+(?:\s*(?:and|,)\s*\d+)*\)\s*$/i, "")
    .replace(/[“”]/g, '"')
    .trim();
  if (cleanLine.length < 12) return cleanLine;

  const exact = draftText.indexOf(cleanLine);
  if (exact >= 0) {
    return draftText.slice(exact, Math.min(exact + cleanLine.length, draftText.length)).trim();
  }

  const quoted = cleanLine.match(/"([^"]+)"/)?.[1] || cleanLine;
  const qTokens = tokenizeForCompare(quoted);
  if (qTokens.length < 4) return cleanLine;

  const paragraphs = draftText
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 40);

  let best = "";
  let bestScore = -1;
  for (const p of paragraphs) {
    const pTokens = new Set(tokenizeForCompare(p));
    let overlap = 0;
    for (const t of qTokens) {
      if (pTokens.has(t)) overlap += 1;
    }
    const score = overlap / qTokens.length;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  if (bestScore < 0.35 || !best) return cleanLine;
  const sentences = best.split(/(?<=[.!?])\s+/).filter(Boolean);
  const chosen =
    sentences.find((s) => {
      const sTokens = new Set(tokenizeForCompare(s));
      let overlap = 0;
      for (const t of qTokens) {
        if (sTokens.has(t)) overlap += 1;
      }
      return overlap / qTokens.length >= 0.4;
    }) || best;

  return chosen.slice(0, 320).trim();
}

function enforceEvidenceGrounding(answer: string, draftText: string) {
  const match = answer.match(/^\s*Evidence from draft:\s*([\s\S]*?)(?=^\s*Next edit:|^\s*Paper suggestion:|$)/im);
  if (!match) return answer;
  const rawBlock = match[1] || "";
  const lines = rawBlock
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return answer;

  const grounded = lines
    .slice(0, 3)
    .map((line) => `- "${bestDraftSnippetForEvidence(draftText, line)}"`);
  const replacement = `Evidence from draft:\n${grounded.join("\n")}`;
  return answer.replace(match[0], replacement);
}

function getSupervisorModel() {
  return process.env.OPENAI_SUPERVISOR_MODEL || "gpt-4.1";
}

function getSupervisorFallbackModel() {
  return process.env.OPENAI_SUPERVISOR_FALLBACK_MODEL || getModel() || getFallbackModel();
}

function buildJsonSupervisorPrompt(args: {
  question: string;
  context: string;
  chatHistory: Array<{ role: string; content: string }>;
  project: { title: string; field: string; degreeLevel: string; language: string; researchQuestion: string };
  paperHints: string;
}) {
  const history = args.chatHistory
    .slice(-12)
    .map((m, i) => `${i + 1}. ${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  return `
You are ThesisPilot's thesis supervisor: a demanding academic writing coach (NOT a ghostwriter).
You help the student improve rigor, structure, methods, exposition, and integrity. You do NOT write the thesis for them.
Take your time and think deeply. Prioritize meaningful, context-aware feedback over speed.

Non-negotiables:
- Be specific and non-vague. Avoid generic advice like "consider improving clarity".
- Anchor claims to the draft using exact substrings in anchor_snippet fields (copy verbatim from the draft context).
- If information is missing, use ASK_CLARIFICATION.
- Never fabricate citations. External paper hints are suggestions only; the student must verify fit and cite correctly.
- Do NOT output APPLY_EDIT. Edits must be proposed via SUGGEST_EDIT; the student approves in UI before anything is applied.
- Return JSON ONLY (no markdown fences) matching this TypeScript shape:
{
  "schemaVersion": 1,
  "reply_markdown": string,
  "integrity_reminder": string,
  "actions": Array<
    | { "type":"COMMENT","id":string,"message":string,"anchor_snippet"?:string,"priority"?: "low"|"medium"|"high" }
    | { "type":"HIGHLIGHT","id":string,"anchor_snippet":string,"label"?:string }
    | { "type":"SCROLL_TO","id":string,"anchor_snippet":string }
    | { "type":"SUGGEST_EDIT","id":string,"anchor_snippet":string,"replacement":string,"rationale":string }
    | { "type":"SUGGEST_FORMULA","id":string,"formula_latex":string,"anchor_snippet"?:string,"note"?:string }
    | { "type":"SUGGEST_FIGURE","id":string,"figure_type":"plot"|"table"|"diagram","spec":string,"anchor_snippet"?:string,"vega_lite_json"?:string }
    | { "type":"ASK_CLARIFICATION","id":string,"question":string }
    | { "type":"PRIORITY_FIX","id":string,"title":string,"details":string,"anchor_snippet"?:string }
    | { "type":"SCHOLAR_SEARCH","id":string,"query":string,"reason"?:string }
  >
}

Action guidance:
- Prefer 6–14 actions. Include at least 2 PRIORITY_FIX or SUGGEST_EDIT when real weaknesses exist.
- SUGGEST_EDIT must replace an exact contiguous substring that exists in the draft context (anchor_snippet).
- Use SUGGEST_FORMULA when metrics/models are referenced without definitions.
- Use SUGGEST_FIGURE when a plot/table/diagram would materially clarify claims (include a concrete spec; optional vega_lite_json as a compact JSON string).
- Use SCHOLAR_SEARCH with a focused query when literature grounding is needed (student still must read sources).
- Use HIGHLIGHT/SCROLL_TO for the most important locations.

Project:
- Title: ${args.project.title}
- Field: ${args.project.field}
- Level: ${args.project.degreeLevel}
- Language: ${args.project.language}
- Research question: ${args.project.researchQuestion}

External paper hints (verify before citing):
${args.paperHints || "(none)"}

Recent chat:
${history || "(none)"}

Draft context:
${args.context}

User question:
${args.question}
`.trim();
}

function buildJsonSingleSuggestionPrompt(args: {
  context: string;
  chatHistory: Array<{ role: string; content: string }>;
  project: { title: string; field: string; degreeLevel: string; language: string; researchQuestion: string };
  paperHints: string;
}) {
  const history = args.chatHistory
    .slice(-8)
    .map((m, i) => `${i + 1}. ${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  return `
You are ThesisPilot's thesis supervisor: a demanding academic writing coach (NOT a ghostwriter).
The student started the **Suggestions walkthrough**: one concrete, approvable edit at a time.
Take your time and choose the single highest-impact edit after careful analysis.

Return JSON ONLY (no markdown fences), schemaVersion 1.

Hard rules:
- "actions" must contain **exactly one** SUGGEST_EDIT (the single highest-impact fix you can anchor in the draft).
- That SUGGEST_EDIT.anchor_snippet MUST be a **verbatim contiguous substring** from the draft context below (copy/paste; include LaTeX/commands exactly as in the draft). Prefer anchor length roughly 40–500 characters when possible.
- "reply_markdown": at most ~120 words: what is wrong, what the replacement improves, and one integrity note tone (student remains responsible).
- "integrity_reminder": one short sentence on authorship / verification.
- Do **not** add a second SUGGEST_EDIT. Do not use APPLY_EDIT.
- If the draft truly has no safe anchored fix, return **zero** SUGGEST_EDIT and instead a single ASK_CLARIFICATION with a precise question.

Optional JSON shape reminder:
{ "schemaVersion": 1, "reply_markdown": string, "integrity_reminder": string, "actions": [ { "type":"SUGGEST_EDIT", "id": string, "anchor_snippet": string, "replacement": string, "rationale": string } ] }

Project:
- Title: ${args.project.title}
- Field: ${args.project.field}
- Level: ${args.project.degreeLevel}
- Language: ${args.project.language}
- Research question: ${args.project.researchQuestion}

External paper hints (verify before citing):
${args.paperHints || "(none)"}

Recent chat:
${history || "(none)"}

Draft context:
${args.context}

Task: Output exactly one best SUGGEST_EDIT anchored in the draft, or one ASK_CLARIFICATION if impossible.
`.trim();
}

function trimSingleSuggestionPayload(parsed: SupervisorPayload): SupervisorPayload {
  const edits = parsed.actions.filter((a) => a.type === "SUGGEST_EDIT");
  if (edits.length >= 1) {
    return { ...parsed, actions: [edits[0]] };
  }
  const clarify = parsed.actions.find((a) => a.type === "ASK_CLARIFICATION");
  if (clarify) return { ...parsed, actions: [clarify] };
  return { ...parsed, actions: parsed.actions.slice(0, 2) };
}

function buildJsonFixPrompt(broken: string) {
  return `
Fix the following text so it becomes VALID JSON matching ThesisPilot supervisor schemaVersion=1.
Return JSON ONLY. No markdown fences. No commentary.

Broken output:
${broken.slice(0, 12000)}
`.trim();
}

function buildFigureProposalPrompt(args: {
  context: string;
  project: { title: string; field: string; degreeLevel: string; language: string; researchQuestion: string };
  selectedText?: string;
  suggestionType: "table" | "figure";
  existingVisualsText: string;
  currentSection: "results" | "methodology" | "other";
  avoidNotes?: string;
}) {
  const typeSpecific =
    args.suggestionType === "table"
      ? `You are proposing exactly one insertable academic LaTeX table for the current thesis draft. Return only valid JSON. The latexBlock must be a complete LaTeX table environment. Do not suggest figures.`
      : `You are proposing exactly one insertable academic LaTeX figure placeholder for the current thesis draft. Return only valid JSON. The latexBlock must be a complete LaTeX figure environment. Do not suggest tables.`;
  const sectionRules =
    args.currentSection === "results"
      ? `Current section context is RESULTS/ANALYSIS. Prioritize econometrics-appropriate empirical outputs only: regression tables, descriptive statistics, correlation matrices, robustness tables, coefficient plots, predicted-vs-actual plots, residual plots, time-series plots (if relevant). Block conceptual diagrams or generic network diagrams unless explicitly data-driven in the draft.`
      : args.currentSection === "methodology"
        ? `Current section context is METHODOLOGY. Prefer method-appropriate output templates (model specification table, variable definitions table, estimation design flow only if directly methodological).`
        : `Current section context is OTHER. Still prioritize concrete empirical artifacts over conceptual diagrams.`;

  return `
${typeSpecific}
Take your time and reason carefully about what improves this draft most.
Return only valid JSON matching this schema:
{
  "type": "table" | "figure",
  "title": string,
  "caption": string,
  "label": string,
  "targetSection": string,
  "insertAfterText": string,
  "latexBlock": string,
  "reason": string
}

Rules:
- The latexBlock must be directly insertable into a LaTeX thesis draft.
- Prefer Results / Analysis section evidence and placement.
- If draft lacks numerical results, return a high-quality placeholder template with bracketed placeholders like [fill in], [coefficient], [sample size], [insert figure here].
- Do not output generic commentary. Do not output markdown. JSON only.
- insertAfterText must be an exact phrase copied from the provided draft context.
- type must match the latexBlock environment: table -> \\begin{table}, figure -> \\begin{figure}.
- Required type for this request: ${args.suggestionType}.
- Keep reason concise and concrete (why this improves academic quality).
- Do NOT duplicate any existing visual's label/caption/theme.
- If no real results yet, provide a realistic econometrics placeholder with [fill in] style placeholders.
${sectionRules}
- Prefer:
  * table: regression results, descriptive stats, model comparison, robustness checks
  * figure: trends, distributions, predicted vs observed, residuals, performance over time

Project:
- Title: ${args.project.title}
- Field: ${args.project.field}
- Level: ${args.project.degreeLevel}
- Language: ${args.project.language}
- Research question: ${args.project.researchQuestion}

Selected text (if any):
${(args.selectedText || "").trim() || "(none)"}

Existing visuals in draft (must not duplicate):
${args.existingVisualsText || "(none found)"}

${args.avoidNotes ? `Additional anti-duplication constraints:\n${args.avoidNotes}` : ""}

Draft context:
${args.context}
`.trim();
}

function buildDeliberationPrompt(args: {
  mode: "single_suggestion" | "figure_proposal";
  question: string;
  context: string;
  project: { title: string; field: string; degreeLevel: string; language: string; researchQuestion: string };
  selectedText?: string;
  existingVisualsText?: string;
  currentSection?: "results" | "methodology" | "other";
  suggestionType?: "table" | "figure";
}) {
  return `
You are preparing internal deliberation notes for a high-quality thesis supervisor response.
These notes are NOT shown to the user. Think slowly and thoroughly.

Mode: ${args.mode}
Question: ${args.question}

Project:
- Title: ${args.project.title}
- Field: ${args.project.field}
- Level: ${args.project.degreeLevel}
- Language: ${args.project.language}
- Research question: ${args.project.researchQuestion}

Selected text:
${(args.selectedText || "").trim() || "(none)"}

Section context: ${args.currentSection || "n/a"}
Requested suggestion type: ${args.suggestionType || "n/a"}

Existing visuals:
${args.existingVisualsText || "(none)"}

Draft context:
${args.context}

Output plain text with:
1) Top weaknesses/opportunities (ranked)
2) Concrete anchor candidates
3) Why each candidate is high impact
4) Risks to avoid (generic advice, duplication, weak fit)
5) Final recommendation to execute
`.trim();
}

function buildLegacyPrompt(args: {
  question: string;
  context: string;
  chatHistory: Array<{ role: string; content: string }>;
}) {
  const history = args.chatHistory
    .slice(-8)
    .map((m, i) => `${i + 1}. ${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  return `
You are a sharp thesis supervisor. Be accurate, grounded in the provided draft context, and useful.

Output format (plain text only, no markdown headings):
Answer: (2-5 concise sentences directly answering the user question)
Evidence from draft:
- quote exact phrases/numbers from context that support your answer (up to 3 bullets)
Next edit: (one concrete action the student can do now)

Hard limits:
- Total output: max 260 words.
- Do not hallucinate tables/labels/values not present in context.
- If context is insufficient, say exactly what is missing and ask for that specific snippet.

Recent chat turns:
${history || "(none)"}

Draft context:
${args.context}

User question:
${args.question}
`.trim();
}

function proposalMatchesType(proposal: GraphTableProposal, suggestionType: "table" | "figure") {
  if (proposal.type !== suggestionType) return false;
  const block = proposal.latexBlock.trim();
  if (suggestionType === "table") return /\\begin\{table\}/.test(block) && !/\\begin\{figure\}/.test(block);
  return /\\begin\{figure\}/.test(block) && !/\\begin\{table\}/.test(block);
}

type ExistingVisual = {
  type: "table" | "figure";
  label: string;
  caption: string;
  keywords: string[];
};

function normalizeLoose(s: string) {
  return s
    .toLowerCase()
    .replace(/\\[a-z]+\{[^}]*\}/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractKeywords(s: string) {
  const words = normalizeLoose(s)
    .split(" ")
    .filter((w) => w.length >= 4);
  return [...new Set(words)].slice(0, 12);
}

function parseExistingVisuals(draftText: string): ExistingVisual[] {
  const visuals: ExistingVisual[] = [];
  const envRe = /\\begin\{(table|figure)\}[\s\S]*?\\end\{\1\}/g;
  let m: RegExpExecArray | null;
  while ((m = envRe.exec(draftText)) !== null) {
    const block = m[0];
    const type = (m[1] as "table" | "figure") || "figure";
    const label = block.match(/\\label\{([^}]+)\}/)?.[1]?.trim() || "";
    const caption = block.match(/\\caption\{([^}]+)\}/)?.[1]?.trim() || "";
    visuals.push({ type, label, caption, keywords: extractKeywords(`${label} ${caption} ${block.slice(0, 320)}`) });
  }
  return visuals.slice(0, 24);
}

function detectCurrentSection(draftText: string): "results" | "methodology" | "other" {
  const lower = draftText.toLowerCase();
  if (
    lower.includes("\\section{results") ||
    lower.includes("\\section{analysis") ||
    lower.includes("\\section{results / analysis")
  ) {
    return "results";
  }
  if (lower.includes("\\section{methodology")) return "methodology";
  return "other";
}

function jaccardSimilarity(a: string, b: string) {
  const sa = new Set(normalizeLoose(a).split(" ").filter((x) => x.length >= 3));
  const sb = new Set(normalizeLoose(b).split(" ").filter((x) => x.length >= 3));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union <= 0 ? 0 : inter / union;
}

function isDuplicateProposal(proposal: GraphTableProposal, existing: ExistingVisual[]) {
  const labelNorm = normalizeLoose(proposal.label);
  const captionNorm = normalizeLoose(proposal.caption);
  const proposalKeywords = extractKeywords(`${proposal.title} ${proposal.caption} ${proposal.reason} ${proposal.latexBlock}`);
  const isNetworkLike = normalizeLoose(`${proposal.title} ${proposal.caption} ${proposal.reason}`).includes("network");
  const existingNetworkCount = existing.filter((v) => normalizeLoose(`${v.caption} ${v.label}`).includes("network")).length;

  for (const v of existing) {
    if (proposal.type !== v.type) continue;
    if (labelNorm && v.label && labelNorm === normalizeLoose(v.label)) return true;
    if (captionNorm && v.caption) {
      const sim = jaccardSimilarity(captionNorm, v.caption);
      if (sim >= 0.58) return true;
      if (normalizeLoose(v.caption).includes(captionNorm) || captionNorm.includes(normalizeLoose(v.caption))) return true;
    }
    const overlap = proposalKeywords.filter((k) => v.keywords.includes(k)).length;
    if (overlap >= 6) return true;
  }
  if (isNetworkLike && existingNetworkCount >= 1) return true;
  return false;
}

async function callSupervisorModel(model: string, input: string, maxTokens: number) {
  const response = await openai.responses.create({
    model,
    input,
    max_output_tokens: maxTokens,
  });
  return (response.output_text || "").trim();
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = requestSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ error: "Invalid chat request." }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: payload.data.projectId } });
  if (!project || project.userId !== session.user.id) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const usageCheck = await ensureUsageAllowed(session.user.id);
  if (!usageCheck.allowed) {
    return NextResponse.json(
      { error: "Monthly AI review limit reached. Upgrade in pricing.", redirectTo: "/pricing" },
      { status: 402 },
    );
  }

  const chatHistory = payload.data.chatHistory || [];
  const interaction = payload.data.supervisorInteraction;
  const isSupervisorSuggestionAction = interaction === "single_suggestion" || interaction === "figure_proposal";

  if (isSupervisorSuggestionAction) {
    const suggestionUsageCheck = await ensureSupervisorSuggestionAllowed(session.user.id);
    if (!suggestionUsageCheck.allowed) {
      return NextResponse.json(
        { error: "Monthly AI supervisor suggestion limit reached. Upgrade in pricing.", redirectTo: "/pricing" },
        { status: 402 },
      );
    }
  }

  const context = buildContext(payload.data.draftText, payload.data.question, payload.data.selectedText);

  const paperQuery =
    interaction === "single_suggestion"
      ? `${project.title} ${project.field} ${project.researchQuestion} thesis methods results`.trim()
      : `${payload.data.question} ${project.title} ${project.field} ${project.researchQuestion}`.trim();
  const { papers } = await semanticScholarSearch(paperQuery, 5);
  const paperHints =
    papers.length > 0
      ? papers
          .map((p, i) => {
            const authors = (p.authors || [])
              .slice(0, 2)
              .map((a) => a.name)
              .filter(Boolean)
              .join(", ");
            const by = [p.year, authors ? `authors: ${authors}` : ""].filter(Boolean).join(" · ");
            const link =
              p.url || `https://www.semanticscholar.org/paper/${encodeURIComponent(p.paperId)}`;
            return `${i + 1}. ${p.title}${by ? ` (${by})` : ""}\n   ${link}`;
          })
          .join("\n")
      : "";

  const jsonPrompt =
    interaction === "single_suggestion"
      ? buildJsonSingleSuggestionPrompt({
          context,
          chatHistory,
          project: {
            title: project.title,
            field: project.field,
            degreeLevel: project.degreeLevel,
            language: project.language,
            researchQuestion: project.researchQuestion,
          },
          paperHints,
        })
      : interaction === "figure_proposal"
        ? ""
        : buildJsonSupervisorPrompt({
          question: payload.data.question,
          context,
          chatHistory,
          project: {
            title: project.title,
            field: project.field,
            degreeLevel: project.degreeLevel,
            language: project.language,
            researchQuestion: project.researchQuestion,
          },
          paperHints,
        });

  const jsonMaxTokens =
    interaction === "single_suggestion"
      ? CHAT_SINGLE_SUGGESTION_TOKENS
      : interaction === "figure_proposal"
        ? CHAT_FIGURE_PROPOSAL_TOKENS
        : CHAT_MAX_OUTPUT_TOKENS;

  let singleSuggestionDeliberation = "";
  if (interaction === "single_suggestion") {
    try {
      singleSuggestionDeliberation = await callSupervisorModel(
        getSupervisorModel(),
        buildDeliberationPrompt({
          mode: "single_suggestion",
          question: payload.data.question,
          context,
          selectedText: payload.data.selectedText,
          project: {
            title: project.title,
            field: project.field,
            degreeLevel: project.degreeLevel,
            language: project.language,
            researchQuestion: project.researchQuestion,
          },
        }),
        CHAT_DELIBERATION_TOKENS,
      );
    } catch {
      singleSuggestionDeliberation = "";
    }
  }

  if (interaction === "figure_proposal") {
    const suggestionType = payload.data.suggestionType;
    if (!suggestionType) {
      return NextResponse.json({ error: "Missing suggestion type." }, { status: 400 });
    }
    const existingVisuals = parseExistingVisuals(payload.data.draftText);
    const currentSection = detectCurrentSection(payload.data.draftText);
    const existingVisualsText =
      existingVisuals.length > 0
        ? existingVisuals
            .map((v, i) => `${i + 1}. [${v.type}] label=${v.label || "(none)"} caption=${v.caption || "(none)"} keywords=${v.keywords.join(", ")}`)
            .join("\n")
        : "(none)";
    let deliberationNotes = "";
    try {
      deliberationNotes = await callSupervisorModel(
        getSupervisorModel(),
        buildDeliberationPrompt({
          mode: "figure_proposal",
          question: payload.data.question,
          context,
          selectedText: payload.data.selectedText,
          existingVisualsText,
          currentSection,
          suggestionType,
          project: {
            title: project.title,
            field: project.field,
            degreeLevel: project.degreeLevel,
            language: project.language,
            researchQuestion: project.researchQuestion,
          },
        }),
        CHAT_DELIBERATION_TOKENS,
      );
    } catch {
      deliberationNotes = "";
    }

    let proposal: GraphTableProposal | null = null;
    const avoidNotes: string[] = [];
    for (let attempt = 0; attempt < MAX_FIGURE_PROPOSAL_ATTEMPTS; attempt += 1) {
      const figurePrompt = buildFigureProposalPrompt({
        context,
        selectedText: payload.data.selectedText,
        suggestionType,
        existingVisualsText,
        currentSection,
        avoidNotes:
          [
            avoidNotes.length > 0 ? avoidNotes.join("\n") : "",
            deliberationNotes ? `Internal deliberation notes:\n${deliberationNotes.slice(0, 7000)}` : "",
          ]
            .filter(Boolean)
            .join("\n\n") || undefined,
        project: {
          title: project.title,
          field: project.field,
          degreeLevel: project.degreeLevel,
          language: project.language,
          researchQuestion: project.researchQuestion,
        },
      });

      let rawFigure = "";
      try {
        rawFigure = await callSupervisorModel(getSupervisorModel(), figurePrompt, jsonMaxTokens);
      } catch {
        try {
          rawFigure = await callSupervisorModel(getSupervisorFallbackModel(), figurePrompt, jsonMaxTokens);
        } catch {
          rawFigure = "";
        }
      }

      proposal = parseGraphTableProposal(rawFigure);
      if (!proposal && rawFigure) {
        const repairPrompt = `
Fix the following text so it is valid JSON and matches this exact schema:
{
  "type": "table" | "figure",
  "title": string,
  "caption": string,
  "label": string,
  "targetSection": string,
  "insertAfterText": string,
  "latexBlock": string,
  "reason": string
}
Return JSON only.
Input:
${rawFigure.slice(0, 12000)}
`.trim();
        try {
          const fixed = await callSupervisorModel(getSupervisorFallbackModel(), repairPrompt, CHAT_JSON_RETRY_TOKENS);
          proposal = parseGraphTableProposal(fixed);
        } catch {
          proposal = null;
        }
      }
      if (!proposal) continue;
      if (!proposalMatchesType(proposal, suggestionType)) {
        avoidNotes.push(`Attempt ${attempt + 1} failed: wrong type or wrong LaTeX environment. Must be ${suggestionType}.`);
        proposal = null;
        continue;
      }
      if (currentSection === "results") {
        const norm = normalizeLoose(`${proposal.title} ${proposal.caption} ${proposal.reason}`);
        if (norm.includes("network diagram") || norm.includes("conceptual diagram")) {
          avoidNotes.push(`Attempt ${attempt + 1} failed: conceptual/network diagram not allowed for results.`);
          proposal = null;
          continue;
        }
      }
      if (isDuplicateProposal(proposal, existingVisuals)) {
        avoidNotes.push(`Attempt ${attempt + 1} failed: too similar to existing visuals. Propose a different empirical visual.`);
        proposal = null;
        continue;
      }
      break;
    }

    if (!proposal) {
      return NextResponse.json(
        { error: "Could not generate an insertable table/figure. Try again." },
        { status: 422 },
      );
    }

    await incrementUsage(session.user.id);
    await incrementSupervisorSuggestionUsage(session.user.id);
    return NextResponse.json({
      mode: "figure_proposal",
      proposal,
      costMode: "supervisor_figure_proposal",
    });
  }

  const jsonPromptWithDeliberation =
    interaction === "single_suggestion" && singleSuggestionDeliberation
      ? `${jsonPrompt}\n\nInternal deliberation notes (use to improve quality):\n${singleSuggestionDeliberation.slice(0, 7000)}`
      : jsonPrompt;

  let raw = "";
  try {
    raw = await callSupervisorModel(getSupervisorModel(), jsonPromptWithDeliberation, jsonMaxTokens);
  } catch {
    try {
      raw = await callSupervisorModel(getSupervisorFallbackModel(), jsonPromptWithDeliberation, jsonMaxTokens);
    } catch {
      raw = "";
    }
  }

  let parsed = parseSupervisorPayload(raw);
  if (!parsed && raw) {
    const fixPrompt = buildJsonFixPrompt(raw);
    try {
      const fixed = await callSupervisorModel(getSupervisorFallbackModel(), fixPrompt, CHAT_JSON_RETRY_TOKENS);
      parsed = parseSupervisorPayload(fixed);
    } catch {
      parsed = null;
    }
  }

  if (parsed) {
    if (interaction === "single_suggestion") {
      parsed = trimSingleSuggestionPayload(parsed);
    }
    await incrementUsage(session.user.id);
    if (interaction === "single_suggestion") {
      await incrementSupervisorSuggestionUsage(session.user.id);
    }
    return NextResponse.json({
      mode: "structured",
      payload: parsed,
      costMode: interaction === "single_suggestion" ? "supervisor_single" : "supervisor_v1",
    });
  }

  const legacyPrompt = buildLegacyPrompt({
    question:
      interaction === "single_suggestion"
        ? "Give one concrete edit suggestion with Evidence from draft and Next edit."
        : payload.data.question,
    context,
    chatHistory,
  });

  let answer = "";
  try {
    answer = sanitizeLegacyAnswer(await callSupervisorModel(getSupervisorModel(), legacyPrompt, 900));
  } catch {
    try {
      answer = sanitizeLegacyAnswer(await callSupervisorModel(getSupervisorFallbackModel(), legacyPrompt, 900));
    } catch {
      answer = sanitizeLegacyAnswer(
        "Answer: I could not read the model output right now.\nEvidence from draft:\n- No reliable model response was returned.\nNext edit: Ask one focused question and include the exact paragraph/table snippet.",
      );
    }
  }

  answer = enforceEvidenceGrounding(answer, payload.data.draftText);

  await incrementUsage(session.user.id);
  if (interaction === "single_suggestion") {
    await incrementSupervisorSuggestionUsage(session.user.id);
  }

  return NextResponse.json({
    mode: "legacy",
    answer,
    costMode: "light",
  });
}
