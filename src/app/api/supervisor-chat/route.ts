import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";
import { ensureUsageAllowed, incrementUsage } from "@/lib/usage";
import { getFallbackModel, getModel } from "@/lib/ai-config";

const requestSchema = z.object({
  projectId: z.string().min(1),
  question: z.string().min(4).max(2000),
  draftText: z.string().min(20),
  selectedText: z.string().optional(),
  chatHistory: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2400),
      }),
    )
    .max(12)
    .optional(),
});

const MAX_DRAFT_CONTEXT_CHARS = 12000;
const CHAT_MAX_OUTPUT_TOKENS = 340;
const PAPER_SUGGESTION_INTERVAL = 3;

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
    return `Selected passage:\n${selection.slice(0, 2400)}`;
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

  // Keep structure context plus most relevant middle passages.
  add("Opening context:", passages[0]?.slice(0, 900) || "");
  for (const item of scored.slice(0, 4)) {
    add(`Relevant passage ${item.idx + 1}:`, item.p.slice(0, 2200));
  }
  add("Closing context:", passages[passages.length - 1]?.slice(-900) || "");

  const packed = chosen.join("\n\n");
  return packed.length > MAX_DRAFT_CONTEXT_CHARS ? packed.slice(0, MAX_DRAFT_CONTEXT_CHARS) : packed;
}

function sanitizeSupervisorAnswer(raw: string) {
  return raw
    .replace(/\*\*/g, "")
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

function shouldSuggestPaper(chatHistory: Array<{ role: "user" | "assistant"; content: string }>) {
  const priorUserTurns = chatHistory.filter((m) => m.role === "user").length;
  return (priorUserTurns + 1) % PAPER_SUGGESTION_INTERVAL === 0;
}

async function searchRelevantPaper(query: string) {
  const trimmed = query.trim().slice(0, 220);
  if (!trimmed) return null;
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(trimmed)}&limit=5&fields=title,authors,year,url,citationCount`;
  try {
    const resp = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      data?: Array<{ title?: string; year?: number; url?: string; citationCount?: number; authors?: Array<{ name?: string }> }>;
    };
    const rows = (data.data || []).filter((p) => p.title && p.url);
    if (!rows.length) return null;
    rows.sort((a, b) => (b.citationCount || 0) - (a.citationCount || 0));
    return rows[0];
  } catch {
    return null;
  }
}

function appendPaperSuggestion(answer: string, paper: { title?: string; year?: number; url?: string; authors?: Array<{ name?: string }> }) {
  const authors = (paper.authors || [])
    .slice(0, 2)
    .map((a) => a.name)
    .filter(Boolean)
    .join(", ");
  const byline = [paper.year, authors ? `by ${authors}` : ""].filter(Boolean).join(" ");
  return `${answer}\n\nPaper suggestion:\n- ${paper.title}${byline ? ` (${byline})` : ""}\n- Link: ${paper.url}`;
}

function getSupervisorModel() {
  return process.env.OPENAI_SUPERVISOR_MODEL || "gpt-4.1";
}

function getSupervisorFallbackModel() {
  return process.env.OPENAI_SUPERVISOR_FALLBACK_MODEL || getModel() || getFallbackModel();
}

function buildPrompt(args: {
  question: string;
  context: string;
  chatHistory: Array<{ role: string; content: string }>;
  includePaperSuggestionHint: boolean;
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
${args.includePaperSuggestionHint ? "Paper suggestion: (optional this turn; one relevant paper title + short reason)" : ""}

Hard limits:
- Total output: max 220 words.
- Do not hallucinate tables/labels/values not present in context.
- For table questions, explicitly mention any detected table labels/captions and at least one numeric value if present.
- If context is insufficient, say exactly what is missing and ask for that specific snippet.

Recent chat turns (for resolving pronouns like "that table", "those values"):
${history || "(none)"}

Draft context:
${args.context}

User question:
${args.question}
`.trim();
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

  const prompt = buildPrompt({
    question: payload.data.question,
    context: buildContext(payload.data.draftText, payload.data.question, payload.data.selectedText),
    chatHistory: payload.data.chatHistory || [],
    includePaperSuggestionHint: shouldSuggestPaper(payload.data.chatHistory || []),
  });

  let answer = "";
  const chatHistory = payload.data.chatHistory || [];
  try {
    const response = await openai.responses.create({
      model: getSupervisorModel(),
      input: prompt,
      max_output_tokens: CHAT_MAX_OUTPUT_TOKENS,
    });
    answer = sanitizeSupervisorAnswer(response.output_text?.trim() || "");
  } catch {
    try {
      const fallback = await openai.responses.create({
        model: getSupervisorFallbackModel(),
        input: prompt,
        max_output_tokens: CHAT_MAX_OUTPUT_TOKENS,
      });
      answer = sanitizeSupervisorAnswer(fallback.output_text?.trim() || "");
    } catch {
      answer = sanitizeSupervisorAnswer(
        "Answer: I could not read the model output right now.\nEvidence from draft:\n- No reliable model response was returned.\nNext edit: Ask one focused question and include the exact paragraph/table snippet.",
      );
    }
  }

  answer = enforceEvidenceGrounding(answer, payload.data.draftText);

  if (shouldSuggestPaper(chatHistory) && !/\n\s*Paper suggestion:/i.test(answer)) {
    const paper = await searchRelevantPaper(`${payload.data.question} ${payload.data.selectedText || ""}`.trim());
    if (paper?.title && paper?.url) {
      answer = appendPaperSuggestion(answer, paper);
    }
  }

  await incrementUsage(session.user.id);

  return NextResponse.json({
    answer,
    costMode: "light",
  });
}
