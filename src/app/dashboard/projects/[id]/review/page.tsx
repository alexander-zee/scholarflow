"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function jitter(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Split long plain-text replies into a few sequential bubbles (WhatsApp-ish). Keep structured Call/… replies whole. */
function splitAssistantIntoBubbles(raw: string, maxBubbles = 4): string[] {
  const t = raw.trim();
  if (!t) return [];
  if (/^Call:/im.test(t) && t.length < 3200) return [t];
  if (t.length < 360) return [t];

  const paras = t.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  if (paras.length <= 1) return [t];

  const targetLen = Math.max(400, Math.ceil(t.length / maxBubbles));
  const out: string[] = [];
  let buf = "";
  for (const p of paras) {
    const next = buf ? `${buf}\n\n${p}` : p;
    if (next.length > targetLen * 1.25 && buf) {
      out.push(buf);
      buf = p;
    } else {
      buf = next;
    }
  }
  if (buf) out.push(buf);

  if (out.length <= maxBubbles) return out;
  const merged: string[] = [];
  const step = Math.ceil(out.length / maxBubbles);
  for (let i = 0; i < out.length; i += step) {
    merged.push(out.slice(i, i + step).join("\n\n"));
  }
  return merged.slice(0, maxBubbles);
}

function TypingDotsBubble() {
  return (
    <div
      className="mr-auto flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
      aria-live="polite"
      aria-label="Supervisor is typing"
    >
      <span className="sf-typing-dot" />
      <span className="sf-typing-dot" />
      <span className="sf-typing-dot" />
    </div>
  );
}

type ReviewReport = {
  overall_score?: number;
  summary?: string;
  strengths?: string[];
  main_issues?: string[];
  structure_feedback?: string[];
  clarity_feedback?: string[];
  academic_tone_feedback?: string[];
  methodology_feedback?: string[];
  rewrite_suggestions?: Array<{ original?: string; suggestion?: string; reason?: string }>;
  anchor_comments?: Array<{
    quote?: string;
    comment?: string;
    severity?: "high" | "medium" | "low" | string;
  }>;
  next_steps?: string[];
  integrity_notice?: string;
};

type ChatAnchor = { quote: string; comment?: string; severity?: string };

/** `kind: "anchors"` = clickable quotes that jump to the draft textarea. */
type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; kind: "text"; content: string }
  | { role: "assistant"; kind: "anchors"; anchors: ChatAnchor[] };

type ParsedSupervisorBubble =
  | {
      kind: "structured";
      call: string;
      watchLines: string[];
      next: string;
      integrity?: string;
    }
  | {
      kind: "coaching";
      answer: string;
      evidenceLines: string[];
      nextEdit: string;
      paperSuggestion?: string;
      paperLink?: string;
    }
  | { kind: "plain"; body: string };

function parseSupervisorBubble(content: string): ParsedSupervisorBubble {
  const trimmed = content.trim();
  if (/^Answer:/im.test(trimmed)) {
    const answer = trimmed.match(/^\s*Answer:\s*([\s\S]*?)(?=^\s*Evidence from draft:|^\s*Next edit:|$)/im)?.[1]?.trim() ?? "";
    const evidenceBlock = trimmed.match(/^\s*Evidence from draft:\s*([\s\S]*?)(?=^\s*Next edit:|$)/im)?.[1] ?? "";
    const evidenceLines = evidenceBlock
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => line.replace(/^[-*•]\s*/, "").trim())
      .filter((line) => line.length > 0)
      .slice(0, 4);
    const nextEdit = trimmed.match(/^\s*Next edit:\s*([\s\S]*?)(?=^\s*Paper suggestion:|$)/im)?.[1]?.trim() ?? "";
    const paperBlock = trimmed.match(/^\s*Paper suggestion:\s*([\s\S]+)$/im)?.[1]?.trim() ?? "";
    const paperLink = paperBlock.match(/https?:\/\/\S+/i)?.[0];
    const paperSuggestion = paperBlock
      ? paperBlock
          .split("\n")
          .map((l) => l.replace(/^[-*•]\s*/, "").trim())
          .filter(Boolean)
          .join(" ")
      : undefined;
    return { kind: "coaching", answer, evidenceLines, nextEdit, paperSuggestion, paperLink };
  }

  if (!/^Call:/im.test(trimmed)) {
    return { kind: "plain", body: content };
  }

  const call = trimmed.match(/^\s*Call:\s*(.+)$/im)?.[1]?.trim() ?? "";
  const next = trimmed.match(/^\s*Next:\s*(.+)$/im)?.[1]?.trim() ?? "";

  const watchBlock = trimmed.match(/^\s*Watch:\s*([\s\S]*?)(?=^\s*Next:)/im)?.[1] ?? "";
  const watchLines = watchBlock
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 6);

  const integrityMatch = trimmed.match(/\n\s*Integrity:\s*([\s\S]+)$/i);
  const integrity = integrityMatch?.[1]?.trim();

  return { kind: "structured", call, watchLines, next, integrity };
}

function normalizeEvidenceForJump(line: string) {
  const normalized = line
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  // Strip UI/meta tags that are not present in the draft text.
  return normalized
    .replace(/\s*\((passage|passages|para|paras|paragraph|paragraphs|section|sections)\s*[\d,\sand\-–]+\)\s*$/i, "")
    .replace(/\s*[—-]\s*(passage|passages|para|paras|paragraph|paragraphs|section|sections)\s*[\d,\sand\-–]+\s*$/i, "")
    .trim();
}

function buildJumpNeedleVariants(snippet: string) {
  const s = snippet.trim();
  const variants = new Set<string>();
  if (!s) return [];
  const push = (v: string) => {
    const t = v.trim();
    if (t.length >= 16) variants.add(t);
  };

  push(s);
  push(s.replace(/^Table\s+/i, ""));
  push(s.replace(/^["'`]+|["'`]+$/g, ""));
  push(s.replace(/\\\\/g, "\\"));
  push(s.replace(/\\\\/g, "\\").replace(/^Table\s+/i, ""));
  push(s.replace(/\s+/g, " "));
  push(s.replace(/\\[(){}\[\]]/g, "").replace(/\s+/g, " "));
  push(s.replace(/\s*\((passage|passages|para|paras|paragraph|paragraphs|section|sections)\s*[\d,\sand\-–]+\)\s*$/i, ""));
  push(s.replace(/\s*[—-]\s*(passage|passages|para|paras|paragraph|paragraphs|section|sections)\s*[\d,\sand\-–]+\s*$/i, ""));

  const quoted = s.match(/["“](.+?)["”]/);
  if (quoted?.[1]) {
    push(quoted[1]);
    push(quoted[1].replace(/\\\\/g, "\\"));
  }

  const parts = s
    .split(/…|\.{3,}|--|—/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 20);
  for (const p of parts) {
    push(p);
    push(p.replace(/\\\\/g, "\\"));
  }
  return Array.from(variants);
}

function SupervisorChatBody({ content, onJump }: { content: string; onJump?: (snippet: string) => void }) {
  const parsed = parseSupervisorBubble(content);
  if (parsed.kind === "plain") {
    return <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{parsed.body}</p>;
  }

  if (parsed.kind === "coaching") {
    return (
      <div className="space-y-3 text-sm">
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Answer</p>
          <p className="mt-1 whitespace-pre-wrap leading-relaxed text-slate-900">{parsed.answer || "—"}</p>
        </div>
        {parsed.evidenceLines.length > 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Evidence from draft</p>
            <ul className="mt-1.5 space-y-1.5">
              {parsed.evidenceLines.map((line) => (
                <li key={line}>
                  <button
                    type="button"
                    onClick={() => onJump?.(normalizeEvidenceForJump(line))}
                    className="w-full rounded-md bg-slate-50 px-2 py-1 text-left text-[13px] leading-relaxed text-slate-800 transition hover:bg-blue-50 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70"
                    title="Jump to this evidence in draft"
                  >
                    {line}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="rounded-lg border border-slate-200 bg-emerald-50/55 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800">Next edit</p>
          <p className="mt-1 font-medium leading-relaxed text-slate-900">{parsed.nextEdit || "—"}</p>
        </div>
        {parsed.paperSuggestion ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Paper suggestion</p>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-900">{parsed.paperSuggestion}</p>
            {parsed.paperLink ? (
              <a
                href={parsed.paperLink}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-xs font-medium text-blue-700 underline underline-offset-2 hover:text-blue-800"
              >
                Open paper
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50/90 px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-blue-800">Call</p>
        <p className="mt-0.5 text-slate-900">{parsed.call || "—"}</p>
      </div>
      {parsed.watchLines.length > 0 ? (
        <div className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-900">Watch</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-slate-800">
            {parsed.watchLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="rounded-lg border-l-4 border-emerald-600 bg-emerald-50/90 px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-900">Next</p>
        <p className="mt-0.5 font-medium text-slate-900">{parsed.next || "—"}</p>
      </div>
      {parsed.integrity ? (
        <p className="rounded-md border border-amber-200/90 bg-amber-50/60 px-2.5 py-1.5 text-xs leading-snug text-amber-950">
          <span className="font-semibold text-amber-900">Integrity: </span>
          {parsed.integrity}
        </p>
      ) : null}
    </div>
  );
}

function formatReviewNarrativeForChat(
  report: ReviewReport | null,
  kind: "full" | "selection",
  hasAnchors: boolean,
): string {
  if (!report) return "No structured feedback was returned.";
  const lines: string[] = [];
  lines.push(kind === "selection" ? "— Selection review —" : "— Full-draft review —");
  if (typeof report.overall_score === "number") {
    lines.push(`Overall score: ${report.overall_score}`);
  }
  if (report.summary) {
    lines.push("", "Summary", report.summary);
  }
  if (report.strengths?.length) {
    lines.push("", "Strengths");
    report.strengths.forEach((s) => lines.push(`• ${s}`));
  }
  if (report.main_issues?.length) {
    lines.push("", "Main issues");
    report.main_issues.forEach((s) => lines.push(`• ${s}`));
  }
  for (const label of ["structure_feedback", "clarity_feedback", "academic_tone_feedback", "methodology_feedback"] as const) {
    const arr = report[label] as string[] | undefined;
    if (arr?.length) {
      lines.push("", label.replace(/_/g, " "));
      arr.forEach((s) => lines.push(`• ${s}`));
    }
  }
  if (report.rewrite_suggestions?.length) {
    lines.push("", "Rewrite suggestions");
    report.rewrite_suggestions.slice(0, 6).forEach((rw, i) => {
      lines.push(`\n[${i + 1}] ${rw.reason || "Suggestion"}`);
      if (rw.original) lines.push(`  From: ${rw.original.slice(0, 280)}${rw.original.length > 280 ? "…" : ""}`);
      if (rw.suggestion) lines.push(`  Try: ${rw.suggestion.slice(0, 280)}${rw.suggestion.length > 280 ? "…" : ""}`);
    });
  }
  if (hasAnchors) {
    lines.push(
      "",
      "Next: a “Jump in draft” card lists exact quotes from your text—tap any quote to scroll the draft there and highlight it.",
    );
  }
  if (report.next_steps?.length) {
    lines.push("", "Next steps");
    report.next_steps.forEach((s) => lines.push(`• ${s}`));
  }
  if (report.integrity_notice) {
    lines.push("", "Integrity", report.integrity_notice);
  }
  return lines.join("\n");
}

function extractReviewAnchors(report: ReviewReport | null): ChatAnchor[] {
  if (!report?.anchor_comments?.length) return [];
  return report.anchor_comments
    .filter((a) => typeof a.quote === "string" && a.quote.trim().length > 0)
    .slice(0, 16)
    .map((a) => ({
      quote: a.quote!.trim(),
      comment: a.comment?.trim() || undefined,
      severity: a.severity ? String(a.severity).trim() : undefined,
    }));
}

function AnchorJumpPanel({ anchors, onJump }: { anchors: ChatAnchor[]; onJump: (quote: string) => void }) {
  return (
    <div className="space-y-2.5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Jump in draft</p>
        <p className="mt-0.5 text-xs text-slate-600">Tap a quote to scroll there and highlight it in your draft.</p>
      </div>
      <ul className="space-y-2">
        {anchors.map((a, i) => (
          <li key={`${i}-${a.quote.slice(0, 48)}`}>
            <button
              type="button"
              onClick={() => onJump(a.quote)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2.5 text-left transition hover:border-blue-300 hover:bg-blue-50/70 focus:outline-none focus:ring-2 focus:ring-blue-400/35"
            >
              {a.severity ? (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">{a.severity}</span>
              ) : null}
              <p className="mt-1 line-clamp-5 font-mono text-[12px] leading-snug text-slate-900">"{a.quote}"</p>
              {a.comment ? <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{a.comment}</p> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ProjectReviewPage() {
  const params = useParams<{ id: string }>();
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const jumpTimersRef = useRef<number[]>([]);
  const lastJumpMissRef = useRef<{ key: string; at: number } | null>(null);
  const [text, setText] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [loadingDraft, setLoadingDraft] = useState(true);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftStatus, setDraftStatus] = useState("");
  const [loadingReview, setLoadingReview] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [staggerDelivering, setStaggerDelivering] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const autoFullReviewStarted = useRef(false);

  const supervisorTyping = loadingReview || chatLoading || staggerDelivering;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, supervisorTyping]);

  function clearJumpTimers() {
    jumpTimersRef.current.forEach((id) => window.clearTimeout(id));
    jumpTimersRef.current = [];
  }

  useEffect(() => () => clearJumpTimers(), []);

  function scheduleJumpTimer(fn: () => void, ms: number) {
    const id = window.setTimeout(fn, ms);
    jumpTimersRef.current.push(id);
  }

  function jumpToTextSnippet(snippet?: string) {
    const rawNeedle = (snippet || "").trim();
    if (!rawNeedle) return;
    const el = editorRef.current;
    if (!el) return;
    clearJumpTimers();
    el.classList.remove("editor-jump-active", "jump-highlight-pulse", "jump-inset-glow");

    const haystack = el.value;
    const needles = buildJumpNeedleVariants(rawNeedle);
    let index = -1;
    let matchLen = 0;
    const lowerHaystack = haystack.toLowerCase();
    for (const needle of needles) {
      const exactIdx = haystack.indexOf(needle);
      if (exactIdx >= 0) {
        index = exactIdx;
        matchLen = needle.length;
        break;
      }
      const ciIdx = lowerHaystack.indexOf(needle.toLowerCase());
      if (ciIdx >= 0) {
        index = ciIdx;
        matchLen = needle.length;
        break;
      }
      const prefix = needle.slice(0, Math.min(needle.length, 180)).trim();
      if (prefix.length >= 16) {
        const prefixIdx = lowerHaystack.indexOf(prefix.toLowerCase());
        if (prefixIdx >= 0) {
          index = prefixIdx;
          matchLen = Math.min(prefix.length, haystack.length - prefixIdx);
          break;
        }
      }
    }

    if (index < 0) {
      const key = normalizeEvidenceForJump(rawNeedle).toLowerCase();
      const now = Date.now();
      const recentlySameMiss =
        lastJumpMissRef.current &&
        lastJumpMissRef.current.key === key &&
        now - lastJumpMissRef.current.at < 4000;
      if (!recentlySameMiss) {
        lastJumpMissRef.current = { key, at: now };
        setChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            kind: "text",
            content:
              "That quote was not found in your current draft (it may have changed). Try “Review selection” on the passage you care about.",
          },
        ]);
      }
      return;
    }

    const end = Math.min(index + matchLen, haystack.length);
    el.focus();
    const before = haystack.slice(0, index);
    const line = Math.max(before.split("\n").length, 1);
    const totalLines = Math.max(haystack.split("\n").length, 1);
    const targetRatio = Math.min(Math.max(line / totalLines, 0), 1);
    el.scrollTo({
      top: targetRatio * Math.max(el.scrollHeight - el.clientHeight, 0),
      behavior: "smooth",
    });
    scheduleJumpTimer(() => {
      el.classList.add("editor-jump-active");
      el.setSelectionRange(index, end);
      el.classList.add("jump-highlight-pulse");
      scheduleJumpTimer(() => {
        el.classList.remove("jump-highlight-pulse");
        el.classList.add("jump-inset-glow");
      }, 500);
      scheduleJumpTimer(() => {
        el.classList.remove("jump-inset-glow", "editor-jump-active");
      }, 1400);
    }, 360);
  }

  async function deliverAssistantBubbles(fullText: string) {
    const parts = splitAssistantIntoBubbles(fullText, 4);
    setStaggerDelivering(true);
    try {
      await wait(jitter(380, 900));
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) await wait(jitter(520, 1400));
        const chunk = parts[i];
        setChatMessages((prev) => [...prev, { role: "assistant", kind: "text", content: chunk }]);
      }
    } finally {
      setStaggerDelivering(false);
    }
  }

  async function runSupervisorReview(inputText: string, kind: "full" | "selection") {
    setLoadingReview(true);
    setChatError("");
    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: params.id, inputText, mode: "full_review" }),
      });
      const data = await response.json();
      if (!response.ok) {
        setChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            kind: "text",
            content: `Review could not run: ${data.error || "Unknown error"}`,
          },
        ]);
        return;
      }
      const report = (data.report || null) as ReviewReport | null;
      const anchors = extractReviewAnchors(report);
      const body = formatReviewNarrativeForChat(report, kind, anchors.length > 0);
      setLoadingReview(false);
      await deliverAssistantBubbles(body);
      if (anchors.length > 0) {
        await wait(jitter(400, 900));
        setChatMessages((prev) => [...prev, { role: "assistant", kind: "anchors", anchors }]);
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", kind: "text", content: "Review request failed. Try again." },
      ]);
    } finally {
      setLoadingReview(false);
    }
  }

  async function onReviewSelectedText() {
    const target = selectedText.trim();
    if (target.length < 20) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          kind: "text",
          content: "Select at least 20 characters in the draft, then press “Review selection” again.",
        },
      ]);
      return;
    }
    setChatMessages((prev) => [
      ...prev,
      { role: "user", content: `[Selection — ${target.length} characters] Please review this passage.` },
    ]);
    await runSupervisorReview(target, "selection");
  }

  useEffect(() => {
    autoFullReviewStarted.current = false;
    setChatMessages([]);
  }, [params.id]);

  useEffect(() => {
    let isMounted = true;
    setLoadingDraft(true);
    async function loadDraft() {
      try {
        const response = await fetch(`/api/projects/${params.id}/live-draft`);
        const data = await response.json();
        if (isMounted && response.ok) {
          setText(data.draft || "");
          const src = data.source as string | undefined;
          if (src === "live_draft" && data.updatedAt) {
            setDraftStatus("Saved draft loaded");
          } else if (src === "generated_draft") {
            setDraftStatus("Generated draft loaded");
          } else if (src === "outline_only") {
            setDraftStatus("Outline only — generate full draft on the project page when ready");
          } else {
            setDraftStatus("Write your draft here");
          }
        }
      } catch {
        if (isMounted) setDraftStatus("Could not load draft");
      } finally {
        if (isMounted) setLoadingDraft(false);
      }
    }
    loadDraft();
    return () => {
      isMounted = false;
    };
  }, [params.id]);

  useEffect(() => {
    if (loadingDraft) return;
    const trimmed = text.trim();
    if (trimmed.length < 20) return;
    if (autoFullReviewStarted.current) return;
    autoFullReviewStarted.current = true;
    void runSupervisorReview(trimmed, "full");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when draft ready
  }, [loadingDraft, text]);

  useEffect(() => {
    if (loadingDraft) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    const timer = setTimeout(async () => {
      setSavingDraft(true);
      try {
        const response = await fetch(`/api/projects/${params.id}/live-draft`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text }),
        });
        if (response.ok) {
          setDraftStatus("Saved");
        } else {
          setDraftStatus("Save failed");
        }
      } catch {
        setDraftStatus("Save failed");
      } finally {
        setSavingDraft(false);
      }
    }, 900);

    return () => clearTimeout(timer);
  }, [text, loadingDraft, params.id]);

  function updateSelectionFromTextarea() {
    const el = editorRef.current;
    if (!el) return;
    const current = el.value.slice(el.selectionStart, el.selectionEnd);
    setSelectedText(current);
  }

  async function onSendSupervisorChat() {
    const question = chatInput.trim();
    if (question.length < 4) return;
    if (text.trim().length < 20) {
      setChatError("Add some draft text first.");
      return;
    }

    setChatLoading(true);
    setChatError("");
    setChatMessages((prev) => [...prev, { role: "user", content: question }]);
    setChatInput("");
    try {
      const history = chatMessages
        .slice(-10)
        .map((m) => {
          if (m.role === "user") return { role: "user" as const, content: m.content };
          if (m.kind === "text") return { role: "assistant" as const, content: m.content };
          const anchorSummary = m.anchors
            .slice(0, 3)
            .map((a) => `"${a.quote.slice(0, 120)}"`)
            .join(" | ");
          return { role: "assistant" as const, content: `Anchor hints: ${anchorSummary}` };
        })
        .filter((m) => m.content.trim().length > 0);

      const response = await fetch("/api/supervisor-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: params.id,
          question,
          draftText: text,
          selectedText: selectedText.trim() || undefined,
          chatHistory: history,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setChatError(data.error || "Chat failed.");
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", kind: "text", content: "I could not answer that right now." },
        ]);
        return;
      }
      setChatLoading(false);
      await deliverAssistantBubbles(String(data.answer || "No response."));
    } catch {
      setChatError("Chat failed.");
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", kind: "text", content: "I could not answer that right now." },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <main className="flex h-[calc(100dvh-2.25rem)] w-full max-w-none flex-col overflow-hidden px-1 pb-2 pt-1 sm:px-3 md:h-[calc(100dvh-2.75rem)] md:px-5 lg:px-6">
      <header className="mb-3 shrink-0 border-b border-slate-200 pb-3">
        <h1 className="text-lg font-semibold text-slate-900 md:text-xl">Writing studio</h1>
        <p className="mt-0.5 text-xs text-slate-500 md:text-sm">
          Wide draft and supervisor columns. After a full review, use “Jump in draft” quotes to scroll the draft to
          each passage. Long replies arrive in a few bubbles; edits autosave.
        </p>
      </header>

      <section className="grid min-h-0 flex-1 gap-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)] xl:grid-cols-[minmax(0,1.12fr)_minmax(320px,0.88fr)]">
        {/* Draft */}
        <div className="flex min-h-0 min-w-0 flex-col border-b border-slate-200 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 md:px-4">
            <span className="text-sm font-medium text-slate-800">Draft</span>
            <span className="text-xs text-slate-500">
              {loadingDraft ? "Loading…" : savingDraft ? "Saving…" : draftStatus}
            </span>
          </div>
          <textarea
            ref={editorRef}
            spellCheck={false}
            className="min-h-0 w-full flex-1 resize-none border-0 bg-white px-3 py-3 font-mono text-[13px] leading-relaxed text-slate-900 outline-none focus:ring-0 md:px-4 md:py-4"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setDraftStatus("Unsaved");
            }}
            onSelect={updateSelectionFromTextarea}
            onKeyUp={updateSelectionFromTextarea}
            onMouseUp={updateSelectionFromTextarea}
            placeholder="Your thesis or LaTeX draft…"
          />
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 md:px-4">
            <p className="text-[11px] text-slate-500">
              Highlight text for context in chat. For a structured pass on the selection only:
            </p>
            <button
              type="button"
              onClick={() => void onReviewSelectedText()}
              disabled={supervisorTyping || selectedText.trim().length < 20}
              className="shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 disabled:opacity-40"
            >
              Review selection
            </button>
          </div>
        </div>

        {/* Supervisor chat */}
        <div className="flex min-h-0 flex-col bg-slate-50/80">
          <div className="border-b border-slate-200 bg-white px-3 py-2 md:px-4">
            <span className="text-sm font-medium text-slate-800">Supervisor</span>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 md:px-4">
            {!loadingDraft && text.trim().length < 20 ? (
              <p className="text-sm text-slate-500">Add at least 20 characters in the draft for an automatic review.</p>
            ) : null}
            {chatMessages.map((message, idx) => {
              const key = message.role === "user" ? `u-${idx}` : message.kind === "anchors" ? `a-${idx}` : `t-${idx}`;
              if (message.role === "user") {
                return (
                  <div
                    key={key}
                    className="ml-auto max-w-[95%] rounded-2xl bg-slate-800 px-3 py-2.5 text-sm text-white"
                  >
                    {message.content}
                  </div>
                );
              }
              if (message.kind === "anchors") {
                return (
                  <div
                    key={key}
                    className="mr-auto max-w-[min(100%,28rem)] rounded-2xl border border-blue-200/80 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm"
                  >
                    <AnchorJumpPanel anchors={message.anchors} onJump={jumpToTextSnippet} />
                  </div>
                );
              }
              return (
                <div
                  key={key}
                  className="mr-auto max-w-[95%] rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm"
                >
                  <SupervisorChatBody content={message.content} onJump={jumpToTextSnippet} />
                </div>
              );
            })}
            {supervisorTyping ? <TypingDotsBubble /> : null}
            <div ref={chatEndRef} />
          </div>

          <div className="border-t border-slate-200 bg-white p-2 md:p-3">
            <button
              type="button"
              onClick={() => void runSupervisorReview(text.trim(), "full")}
              disabled={supervisorTyping || text.trim().length < 20}
              className="mb-2 text-left text-xs text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-slate-700 disabled:opacity-40"
            >
              Re-run full-draft review
            </button>
            <div className="flex gap-2">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void onSendSupervisorChat();
                  }
                }}
                rows={2}
                placeholder="Ask a focused question…"
                className="min-h-[44px] flex-1 resize-y rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:bg-white"
              />
              <button
                type="button"
                onClick={() => void onSendSupervisorChat()}
                disabled={supervisorTyping || chatInput.trim().length < 4}
                className="self-end rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                Send
              </button>
            </div>
            {chatError ? <p className="mt-1 text-xs text-red-600">{chatError}</p> : null}
            <p className="mt-2 text-[10px] leading-snug text-slate-400">
              ScholarFlow supports learning and revision; you remain responsible for integrity rules and final submissions.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
