"use client";

import { createPortal } from "react-dom";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { useParams } from "next/navigation";
import { marked } from "marked";
import SiteMarketingFooter from "@/components/SiteMarketingFooter";
import type { GraphTableProposal, SupervisorAction, SupervisorPayload } from "@/lib/supervisor-schema";

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function jitter(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Split long plain-text replies into at most a couple of sequential bubbles. Keep structured Call/… replies whole. */
function splitAssistantIntoBubbles(raw: string, maxBubbles = 2): string[] {
  const t = raw.trim();
  if (!t) return [];
  if (/^Call:/im.test(t) && t.length < 3200) return [t];
  if (t.length < 1100) return [t];

  const paras = t.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  if (paras.length <= 1) return [t];

  const targetLen = Math.max(700, Math.ceil(t.length / maxBubbles));
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
      className="mr-auto flex items-center gap-1.5 rounded-2xl bg-slate-100/90 px-4 py-3 shadow-md shadow-slate-400/15"
      aria-live="polite"
      aria-label="Supervisor is typing"
    >
      <span className="sf-typing-dot" />
      <span className="sf-typing-dot" />
      <span className="sf-typing-dot" />
    </div>
  );
}

function sanitizeAssistantHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=/gi, " data-removed=");
}

function SupervisorMarkdown({ source }: { source: string }) {
  const html = useMemo(() => {
    const rendered = marked(source, { gfm: true, breaks: true, async: false });
    return sanitizeAssistantHtml(rendered);
  }, [source]);
  return (
    <div
      className="prose prose-sm max-w-none text-slate-900 prose-headings:tracking-tight prose-a:text-blue-700 prose-code:text-slate-800"
      // eslint-disable-next-line react/no-danger -- trusted model output in supervisor channel; stripped scripts/on* handlers
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function SupervisorActionsPanel({
  actions,
  onJump,
  onApplyEdit,
  collapseAfter = 4,
}: {
  actions: SupervisorAction[];
  onJump: (snippet: string) => void;
  onApplyEdit: (anchor: string, replacement: string) => void;
  /** When there are more actions than this, show a short summary until expanded. */
  collapseAfter?: number;
}) {
  const [showAllActions, setShowAllActions] = useState(false);
  if (!actions.length) return null;
  const shouldCollapse = actions.length > collapseAfter && !showAllActions;
  const visibleActions = shouldCollapse ? actions.slice(0, 2) : actions;

  return (
    <div className="mt-3 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Supervisor actions</p>
        {shouldCollapse ? (
          <span className="text-[10px] font-medium text-slate-500">{actions.length} total</span>
        ) : null}
      </div>
      {shouldCollapse ? (
        <button
          type="button"
          onClick={() => setShowAllActions(true)}
          className="w-full rounded-2xl bg-slate-100/90 px-3 py-2 text-left text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-200/90"
        >
          Show all {actions.length} actions (chat stays compact until you expand)
        </button>
      ) : null}
      <ul className="space-y-2">
        {visibleActions.map((a) => (
          <li key={a.id} className="rounded-2xl bg-slate-50/95 px-3 py-2.5 shadow-sm shadow-slate-400/12">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">{a.type}</span>
              {"priority" in a && a.priority ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">{a.priority}</span>
              ) : null}
            </div>

            {a.type === "COMMENT" ? (
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-900">{a.message}</p>
            ) : null}
            {a.type === "PRIORITY_FIX" ? (
              <div className="mt-1.5 space-y-1">
                <p className="text-sm font-semibold text-slate-900">{a.title}</p>
                <p className="text-[13px] leading-relaxed text-slate-800">{a.details}</p>
              </div>
            ) : null}
            {a.type === "ASK_CLARIFICATION" ? <p className="mt-1.5 text-[13px] font-medium text-slate-900">{a.question}</p> : null}

            {a.type !== "SUGGEST_EDIT" &&
            a.type !== "HIGHLIGHT" &&
            a.type !== "SCROLL_TO" &&
            "anchor_snippet" in a &&
            a.anchor_snippet ? (
              <button
                type="button"
                onClick={() => onJump(a.anchor_snippet!)}
                className="mt-2 w-full rounded-xl bg-white/95 px-2 py-1.5 text-left font-mono text-[11px] leading-snug text-slate-800 shadow-inner shadow-slate-200/50 transition hover:bg-sky-50/80"
              >
                Jump: {a.anchor_snippet.slice(0, 220)}
                {a.anchor_snippet.length > 220 ? "…" : ""}
              </button>
            ) : null}

            {a.type === "HIGHLIGHT" || a.type === "SCROLL_TO" ? (
              <button
                type="button"
                onClick={() => onJump(a.anchor_snippet)}
                className="mt-2 w-full rounded-lg bg-slate-900 px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
              >
                {a.type === "HIGHLIGHT" ? "Highlight in draft" : "Scroll to passage"}
              </button>
            ) : null}

            {a.type === "SUGGEST_EDIT" ? (
              <div className="mt-2 space-y-2">
                <p className="text-xs leading-relaxed text-slate-700">{a.rationale}</p>
                <div className="grid gap-2 md:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase text-slate-500">Anchor</p>
                    <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded-xl bg-white/95 p-2 text-[11px] text-slate-900 shadow-inner shadow-slate-200/40">
                      {a.anchor_snippet}
                    </pre>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase text-slate-500">Replacement</p>
                    <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded-xl bg-white/95 p-2 text-[11px] text-slate-900 shadow-inner shadow-slate-200/40">
                      {a.replacement}
                    </pre>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        typeof window !== "undefined" &&
                        !window.confirm(
                          "Apply this replacement to your draft? You remain responsible for accuracy and integrity; you can undo manually if needed.",
                        )
                      ) {
                        return;
                      }
                      onApplyEdit(a.anchor_snippet, a.replacement);
                    }}
                    className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                  >
                    Approve edit
                  </button>
                  <button type="button" onClick={() => onJump(a.anchor_snippet)} className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm">
                    Jump first
                  </button>
                </div>
              </div>
            ) : null}

            {a.type === "SUGGEST_FORMULA" ? (
              <div className="mt-2 space-y-1">
                <p className="text-[10px] font-semibold uppercase text-slate-500">LaTeX</p>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-white/95 p-2 text-[11px] shadow-inner shadow-slate-200/40">{a.formula_latex}</pre>
                {a.note ? <p className="text-xs text-slate-700">{a.note}</p> : null}
              </div>
            ) : null}

            {a.type === "SUGGEST_FIGURE" ? (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-slate-800">
                  <span className="font-semibold">{a.figure_type}:</span> {a.spec}
                </p>
                {a.vega_lite_json ? (
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase text-slate-500">Vega-Lite sketch (paste into Vega editor)</p>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-white/95 p-2 text-[11px] shadow-inner shadow-slate-200/40">{a.vega_lite_json}</pre>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(a.vega_lite_json!);
                      }}
                      className="rounded-full bg-white/95 px-2 py-1 text-[11px] font-semibold text-slate-800 shadow-sm"
                    >
                      Copy JSON
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {a.type === "SCHOLAR_SEARCH" ? (
              <a
                href={`https://scholar.google.com/scholar?q=${encodeURIComponent(a.query)}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex text-xs font-semibold text-blue-700 underline underline-offset-2"
              >
                Open Google Scholar for: {a.query}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
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
  | { role: "assistant"; kind: "anchors"; anchors: ChatAnchor[] }
  | { role: "assistant"; kind: "supervisor"; payload: SupervisorPayload };

type SuggestionWalkthroughEdit = {
  id: string;
  anchor_snippet: string;
  replacement: string;
  rationale: string;
};

/** Guided Yes/No walkthrough above the chat composer. */
type SuggestionWalkthrough =
  | null
  | { phase: "loading" }
  | { phase: "active"; items: SuggestionWalkthroughEdit[]; index: number }
  | { phase: "clarify"; question: string }
  | { phase: "empty"; hint: string };

type PendingProposal = {
  id: string;
  type: "table" | "figure";
  title: string;
  reason: string;
  latexBlock: string;
  previousDraftBeforeProposal: string;
  markerStart: string;
  markerEnd: string;
};

function chatMessagesToApiHistory(msgs: ChatMessage[]): Array<{ role: "user" | "assistant"; content: string }> {
  return msgs
    .slice(-12)
    .map((m) => {
      if (m.role === "user") return { role: "user" as const, content: m.content };
      if (m.kind === "text") return { role: "assistant" as const, content: m.content };
      if (m.kind === "supervisor") {
        const actionSummary = m.payload.actions
          .map((a) => {
            const anchor = "anchor_snippet" in a && a.anchor_snippet ? a.anchor_snippet.slice(0, 160) : "";
            return `${a.type}${anchor ? ` @ "${anchor}"` : ""}`;
          })
          .join(" | ");
        const combined = `${m.payload.reply_markdown.slice(0, 5200)}\n\n[Supervisor actions: ${actionSummary}]`;
        return { role: "assistant" as const, content: combined.slice(0, 8000) };
      }
      const anchorSummary = m.anchors
        .slice(0, 3)
        .map((a) => `"${a.quote.slice(0, 120)}"`)
        .join(" | ");
      return { role: "assistant" as const, content: `Anchor hints: ${anchorSummary}` };
    })
    .filter((m) => m.content.trim().length > 0);
}

/** How long the draft keeps the emerald selection ring after a Suggestions jump */
const SUGGESTION_JUMP_HOLD_MS = 16_000;
const DEFAULT_JUMP_HOLD_MS = 3200;

/** Offscreen mirror layout: bounding box of value[start:end] as wrapped in the textarea. */
function measureDraftRangeBox(textarea: HTMLTextAreaElement, value: string, start: number, end: number) {
  if (start < 0 || end <= start || end > value.length) return null;
  const cs = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  mirror.setAttribute("aria-hidden", "true");
  const w = textarea.clientWidth;
  mirror.style.cssText = [
    "position:absolute",
    "left:-100000px",
    "top:0",
    "visibility:hidden",
    "pointer-events:none",
    "white-space:pre-wrap",
    "overflow-wrap:anywhere",
    "word-break:break-word",
    "box-sizing:border-box",
    `width:${w}px`,
    `padding:${cs.padding}`,
    `border:${cs.borderWidth} solid transparent`,
    `font:${cs.font}`,
    `line-height:${cs.lineHeight}`,
    `letter-spacing:${cs.letterSpacing}`,
    `text-indent:${cs.textIndent}`,
  ].join(";");
  const mk = document.createElement("mark");
  mk.textContent = value.slice(start, end);
  mirror.append(document.createTextNode(value.slice(0, start)), mk, document.createTextNode(value.slice(end)));
  document.body.appendChild(mirror);
  const top = mk.offsetTop;
  const left = mk.offsetLeft;
  const width = mk.offsetWidth;
  const height = mk.offsetHeight;
  document.body.removeChild(mirror);
  return { top, left, width, height };
}

/** Trim shared prefix/suffix (character-level fallback when there are no words to diff). */
function splitCommonPrefixSuffix(a: string, b: string) {
  let i = 0;
  const minLen = Math.min(a.length, b.length);
  while (i < minLen && a[i] === b[i]) i += 1;
  let ea = a.length - 1;
  let eb = b.length - 1;
  while (ea >= i && eb >= i && a[ea] === b[eb]) {
    ea -= 1;
    eb -= 1;
  }
  return {
    pre: a.slice(0, i),
    midDel: a.slice(i, ea + 1),
    midIns: b.slice(i, eb + 1),
    post: a.slice(ea + 1),
  };
}

function normalizeWordKey(w: string) {
  return w
    .replace(/[\u2018\u2019\u201c\u201d\u2032\u2033]/g, "'")
    .replace(/\u00a0/g, " ")
    .toLowerCase()
    .replace(/^["'({[⟨]+/, "")
    .replace(/[.,;:!?)"'\]}⟩]+$/, "");
}

const WORD_DIFF_MAX = 320;

/**
 * Word-level LCS diff: identical wording appears once (eq); only differing runs are del (red) / ins (green).
 * Avoids redundant whole-paragraph coloring when the model changes a short phrase inside a long anchor.
 */
function wordLcsDiffSegments(a: string, b: string): Array<{ type: "eq" | "del" | "ins"; text: string }> {
  const aw = a.trim().split(/\s+/).filter(Boolean);
  const bw = b.trim().split(/\s+/).filter(Boolean);
  if (aw.length === 0 && bw.length === 0) {
    const d = splitCommonPrefixSuffix(a, b);
    const out: Array<{ type: "eq" | "del" | "ins"; text: string }> = [];
    if (d.pre.trim()) out.push({ type: "eq", text: d.pre.trim() });
    if (d.midDel.trim()) out.push({ type: "del", text: d.midDel.trim() });
    if (d.midIns.trim()) out.push({ type: "ins", text: d.midIns.trim() });
    if (d.post.trim()) out.push({ type: "eq", text: d.post.trim() });
    return out.filter((s) => s.text.length > 0);
  }

  const aWords = aw.length > WORD_DIFF_MAX ? aw.slice(0, WORD_DIFF_MAX) : aw;
  const bWords = bw.length > WORD_DIFF_MAX ? bw.slice(0, WORD_DIFF_MAX) : bw;
  const n = aWords.length;
  const m = bWords.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (normalizeWordKey(aWords[i - 1]) === normalizeWordKey(bWords[j - 1])) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  type Op = { type: "eq" | "del" | "ins"; word: string };
  const ops: Op[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && normalizeWordKey(aWords[i - 1]) === normalizeWordKey(bWords[j - 1])) {
      ops.push({ type: "eq", word: aWords[i - 1] });
      i -= 1;
      j -= 1;
    } else if (i > 0 && (j === 0 || dp[i - 1][j] >= dp[i][j - 1])) {
      ops.push({ type: "del", word: aWords[i - 1] });
      i -= 1;
    } else if (j > 0) {
      ops.push({ type: "ins", word: bWords[j - 1] });
      j -= 1;
    }
  }
  ops.reverse();

  const merged: Array<{ type: "eq" | "del" | "ins"; text: string }> = [];
  for (const op of ops) {
    const last = merged[merged.length - 1];
    if (last && last.type === op.type) {
      last.text = `${last.text} ${op.word}`;
    } else {
      merged.push({ type: op.type, text: op.word });
    }
  }

  const tailNote =
    aw.length > WORD_DIFF_MAX || bw.length > WORD_DIFF_MAX
      ? " … (diff truncated for speed; only the first part of the passage is compared word-by-word.)"
      : "";

  if (tailNote) {
    merged.push({ type: "eq", text: tailNote });
  }

  return merged.filter((s) => s.text.trim().length > 0);
}

function trimLongEqForPopover(text: string, max = 200) {
  const t = text.trim();
  if (t.length <= max) return t;
  const head = Math.max(24, Math.floor(max / 2) - 4);
  const tail = max - head - 3;
  return `${t.slice(0, head)}…${t.slice(-tail)}`;
}

function truncateForUi(s: string, max: number) {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function suggestionWalkthroughSummary(rationale: string) {
  const t = rationale.trim();
  if (!t) return "One concrete wording or structure tweak in your draft.";
  const cut = t.split(/(?<=[.!?])\s+/)[0]?.trim() || t;
  return truncateForUi(cut.length >= 12 ? cut : t, 220);
}

function inferReferenceGraphKind(input: string): "line" | "bar" | "scatter" {
  const t = input.toLowerCase();
  if (
    t.includes("trend") ||
    t.includes("time") ||
    t.includes("series") ||
    t.includes("trajectory") ||
    t.includes("over time")
  ) {
    return "line";
  }
  if (t.includes("distribution") || t.includes("residual") || t.includes("observed") || t.includes("predicted")) {
    return "scatter";
  }
  return "bar";
}

function GraphReferencePreview({ title, caption }: { title: string; caption: string }) {
  const kind = inferReferenceGraphKind(`${title} ${caption}`);
  const w = 360;
  const h = 180;
  const pad = 24;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;

  return (
    <div className="rounded-xl border border-sky-200/70 bg-white/95 p-2 shadow-sm dark:border-sky-400/30 dark:bg-slate-900/80">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-40 w-full rounded-lg bg-sky-50/40 dark:bg-slate-950/40" role="img" aria-label={`Reference preview graph for ${title}`}>
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#64748b" strokeWidth="1.2" />
        <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="#64748b" strokeWidth="1.2" />
        <text x={pad} y={16} fontSize="10" fill="#334155">
          Reference preview
        </text>
        {kind === "line" ? (
          <>
            <polyline
              fill="none"
              stroke="#0284c7"
              strokeWidth="2.4"
              points={`${pad},${h - pad - 18} ${pad + innerW * 0.18},${h - pad - 30} ${pad + innerW * 0.36},${h - pad - 46} ${pad + innerW * 0.55},${h - pad - 58} ${pad + innerW * 0.74},${h - pad - 73} ${pad + innerW},${h - pad - 86}`}
            />
            <polyline
              fill="none"
              stroke="#7dd3fc"
              strokeWidth="2.1"
              points={`${pad},${h - pad - 10} ${pad + innerW * 0.18},${h - pad - 20} ${pad + innerW * 0.36},${h - pad - 28} ${pad + innerW * 0.55},${h - pad - 44} ${pad + innerW * 0.74},${h - pad - 55} ${pad + innerW},${h - pad - 64}`}
            />
          </>
        ) : null}
        {kind === "bar" ? (
          <>
            {[0.18, 0.34, 0.5, 0.66, 0.82].map((x, i) => {
              const heights = [38, 62, 54, 82, 68];
              return (
                <rect
                  key={x}
                  x={pad + innerW * x - 12}
                  y={h - pad - heights[i]}
                  width="24"
                  height={heights[i]}
                  fill="#0ea5e9"
                  opacity={0.85}
                  rx="3"
                />
              );
            })}
          </>
        ) : null}
        {kind === "scatter" ? (
          <>
            {[
              [0.14, 0.78],
              [0.24, 0.68],
              [0.36, 0.61],
              [0.42, 0.56],
              [0.56, 0.45],
              [0.64, 0.41],
              [0.75, 0.29],
              [0.86, 0.23],
            ].map(([x, y], i) => (
              <circle key={`${x}-${y}-${i}`} cx={pad + innerW * x} cy={pad + innerH * y} r="4" fill="#0284c7" opacity="0.85" />
            ))}
            <line x1={pad + innerW * 0.1} y1={pad + innerH * 0.82} x2={pad + innerW * 0.9} y2={pad + innerH * 0.2} stroke="#7dd3fc" strokeWidth="2" strokeDasharray="4 3" />
          </>
        ) : null}
      </svg>
      <p className="mt-1 text-[10px] text-slate-600 dark:text-slate-300">Illustrative reference image only; edit with your real data in the LaTeX draft.</p>
    </div>
  );
}

/** Scroll so the wrapped range is vertically centered (and horizontally if needed). */
function scrollTextareaRangeIntoView(textarea: HTMLTextAreaElement, value: string, start: number, end: number) {
  const box = measureDraftRangeBox(textarea, value, start, end);
  if (!box) return;
  const centerY = box.top + box.height / 2;
  const halfH = textarea.clientHeight / 2;
  const maxScrollTop = Math.max(0, textarea.scrollHeight - textarea.clientHeight);
  textarea.scrollTop = Math.max(0, Math.min(centerY - halfH, maxScrollTop));

  const centerX = box.left + box.width / 2;
  const halfW = textarea.clientWidth / 2;
  const maxScrollLeft = Math.max(0, textarea.scrollWidth - textarea.clientWidth);
  textarea.scrollLeft = Math.max(0, Math.min(centerX - halfW, maxScrollLeft));
}

function DraftSuggestionHighlightLayer({
  textareaRef,
  value,
  range,
  scrollTop,
  scrollLeft,
  draftSlice,
  replacementText,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  range: { start: number; end: number };
  scrollTop: number;
  scrollLeft: number;
  draftSlice: string;
  replacementText: string;
}) {
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [layoutTick, setLayoutTick] = useState(0);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
  const hitRef = useRef<HTMLDivElement | null>(null);
  const leaveTimerRef = useRef<number | null>(null);

  const diffSegments = useMemo(() => {
    return wordLcsDiffSegments(draftSlice, replacementText).map((s) => ({
      ...s,
      text:
        s.type === "eq"
          ? trimLongEqForPopover(s.text, 240)
          : truncateForUi(s.text, 480),
    }));
  }, [draftSlice, replacementText]);
  const hasWordLevelChange = diffSegments.some((s) => s.type === "del" || s.type === "ins");

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) {
      setBox(null);
      return;
    }
    setBox(measureDraftRangeBox(el, value, range.start, range.end));
  }, [textareaRef, value, range.start, range.end, layoutTick]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLayoutTick((t) => t + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, [textareaRef]);

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) window.clearTimeout(leaveTimerRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (!popoverOpen) return;
    const r = hitRef.current?.getBoundingClientRect();
    if (r) {
      const w = Math.min(360, window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
      setPopoverPos({ top: r.bottom + 8, left });
    }
  }, [popoverOpen, scrollTop, scrollLeft, box, layoutTick]);

  const cancelCloseTimer = () => {
    if (leaveTimerRef.current) {
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  };

  const openPopover = () => {
    cancelCloseTimer();
    const r = hitRef.current?.getBoundingClientRect();
    if (r) {
      const w = Math.min(360, window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
      setPopoverPos({ top: r.bottom + 8, left });
    }
    setPopoverOpen(true);
  };

  const scheduleClosePopover = () => {
    cancelCloseTimer();
    leaveTimerRef.current = window.setTimeout(() => setPopoverOpen(false), 240);
  };

  const ta = textareaRef.current;
  const innerWidth = ta ? Math.max(ta.scrollWidth, ta.clientWidth) : 0;
  const innerHeight = ta ? Math.max(ta.scrollHeight, ta.clientHeight) : 0;

  if (!box || !innerWidth) return null;

  const popover =
    popoverOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            role="dialog"
            aria-label="Suggested edit comparison"
            className="fixed z-[100] w-[min(22rem,calc(100vw-1rem))] rounded-2xl bg-white/98 p-3.5 text-[13px] leading-relaxed text-slate-900 shadow-2xl shadow-slate-400/25 backdrop-blur-sm"
            style={{ top: popoverPos.top, left: popoverPos.left }}
            onPointerEnter={cancelCloseTimer}
            onPointerLeave={scheduleClosePopover}
          >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-sky-700/90">Supervisor</p>
            <div className="whitespace-pre-wrap break-words">
              {diffSegments.length === 0 ? (
                <span className="text-slate-600">No change detected.</span>
              ) : (
                diffSegments.map((s, idx) => (
                  <Fragment key={`${idx}-${s.type}`}>
                    {idx > 0 ? " " : null}
                    {s.type === "eq" ? (
                      <span className="text-slate-800">{s.text}</span>
                    ) : s.type === "del" ? (
                      <span className="text-rose-700 line-through decoration-rose-600 decoration-2">{s.text}</span>
                    ) : (
                      <span className="font-semibold text-emerald-700">{s.text}</span>
                    )}
                  </Fragment>
                ))
              )}
            </div>
            {!hasWordLevelChange && draftSlice !== replacementText ? (
              <p className="mt-2 text-[11px] leading-snug text-amber-900/90">
                Same words after normalization — look for punctuation, LaTeX, or spacing differences in the raw draft,
                or use Yes / No to apply the full replacement.
              </p>
            ) : null}
            <p className="mt-3 text-[11px] text-slate-500">
              Use <span className="font-medium text-slate-700">Yes — apply</span> or{" "}
              <span className="font-medium text-slate-700">No — skip</span> in the supervisor column when ready.
            </p>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-[1.25rem]" aria-hidden>
        <div
          className="relative"
          style={{
            width: innerWidth,
            minHeight: innerHeight,
            transform: `translate(${-scrollLeft}px, ${-scrollTop}px)`,
          }}
        >
          <div
            className="pointer-events-none absolute rounded-md bg-teal-500/[0.12]"
            style={{
              top: box.top,
              left: box.left,
              width: Math.max(box.width, 4),
              height: Math.max(box.height, 4),
            }}
          />
          <div
            ref={hitRef}
            className="absolute cursor-help rounded-md bg-transparent shadow-[inset_0_0_0_1px_rgba(13,148,136,0.2)]"
            style={{
              top: box.top,
              left: box.left,
              width: Math.max(box.width, 4),
              height: Math.max(box.height, 4),
              pointerEvents: "auto",
            }}
            onPointerEnter={openPopover}
            onPointerLeave={scheduleClosePopover}
          />
        </div>
      </div>
      {popover}
    </>
  );
}

function findAnchorMatchInDraft(hay: string, anchor: string): { idx: number; len: number } | null {
  const variants = [...new Set([anchor, anchor.replace(/\r\n/g, "\n"), anchor.replace(/\n/g, "\r\n")])];
  for (const v of variants) {
    const t = v.trim();
    if (t.length < 8) continue;
    const idx = hay.indexOf(t);
    if (idx >= 0) return { idx, len: t.length };
  }
  const short = anchor.slice(0, Math.min(200, anchor.length)).trim();
  for (const v of [...new Set([short, short.replace(/\r\n/g, "\n")])]) {
    if (v.length < 8) continue;
    const idx = hay.indexOf(v);
    if (idx >= 0) return { idx, len: v.length };
  }
  return null;
}

function findResultsSectionBounds(draft: string) {
  const lower = draft.toLowerCase();
  const headings = ["\\section{results", "\\section{analysis", "\\section{results / analysis"];
  let start = -1;
  for (const h of headings) {
    const idx = lower.indexOf(h);
    if (idx >= 0 && (start < 0 || idx < start)) start = idx;
  }
  if (start < 0) return null;
  const nextSection = lower.indexOf("\\section{", start + 10);
  const end = nextSection >= 0 ? nextSection : draft.length;
  return { start, end };
}

function findPreferredGraphInsertIndex(draft: string, insertAfterText: string, caretIndex: number) {
  const resultsBounds = findResultsSectionBounds(draft);
  if (resultsBounds) {
    const region = draft.slice(resultsBounds.start, resultsBounds.end);
    const envRe = /\\begin\{(?:table|figure)\}[\s\S]*?\\end\{(?:table|figure)\}/g;
    let m: RegExpExecArray | null;
    let lastVisualEnd = -1;
    while ((m = envRe.exec(region)) !== null) {
      lastVisualEnd = m.index + m[0].length;
    }
    if (lastVisualEnd >= 0) return resultsBounds.start + lastVisualEnd;

    const afterHeading = region.indexOf("}");
    if (afterHeading >= 0) {
      const paragraphBreak = region.indexOf("\n\n", afterHeading);
      if (paragraphBreak >= 0) return resultsBounds.start + paragraphBreak + 2;
      return Math.min(draft.length, resultsBounds.start + afterHeading + 1);
    }
    return resultsBounds.start;
  }

  const byAnchor = findAnchorMatchInDraft(draft, insertAfterText);
  if (byAnchor) return byAnchor.idx + byAnchor.len;

  const lower = draft.toLowerCase();
  const resultMarkers = [
    "\\section{results",
    "\\section{result",
    "\\section{analysis",
    "\\section{results / analysis",
    "results / analysis",
    "results and analysis",
  ];
  for (const marker of resultMarkers) {
    const idx = lower.indexOf(marker);
    if (idx >= 0) {
      const nextBreak = draft.indexOf("\n\n", idx);
      return nextBreak >= 0 ? nextBreak + 2 : Math.min(draft.length, idx + marker.length);
    }
  }

  if (caretIndex >= 0 && caretIndex <= draft.length) return caretIndex;
  return draft.length;
}

function proposalRangeFromMarkers(draft: string, markerStart: string, markerEnd: string) {
  const start = draft.indexOf(markerStart);
  if (start < 0) return null;
  const endMarkerIndex = draft.indexOf(markerEnd, start + markerStart.length);
  if (endMarkerIndex < 0) return null;
  return { start, end: endMarkerIndex + markerEnd.length };
}

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
        <div className="rounded-2xl bg-slate-50/90 px-3 py-2.5 shadow-sm shadow-slate-400/10">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Answer</p>
          <p className="mt-1 whitespace-pre-wrap leading-relaxed text-slate-900">{parsed.answer || "—"}</p>
        </div>
        {parsed.evidenceLines.length > 0 ? (
          <div className="rounded-2xl bg-white/95 px-3 py-2.5 shadow-sm shadow-slate-400/12">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Evidence from draft</p>
            <ul className="mt-1.5 space-y-1.5">
              {parsed.evidenceLines.map((line) => (
                <li key={line}>
                  <button
                    type="button"
                    onClick={() => onJump?.(normalizeEvidenceForJump(line))}
                    className="w-full rounded-xl bg-slate-50/90 px-2 py-1 text-left text-[13px] leading-relaxed text-slate-800 transition hover:bg-sky-50/90 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/50"
                    title="Jump to this evidence in draft"
                  >
                    {line}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="rounded-2xl bg-emerald-50/80 px-3 py-2.5 shadow-sm shadow-emerald-200/25">
          <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800">Next edit</p>
          <p className="mt-1 font-medium leading-relaxed text-slate-900">{parsed.nextEdit || "—"}</p>
        </div>
        {parsed.paperSuggestion ? (
          <div className="rounded-2xl bg-slate-50/90 px-3 py-2.5 shadow-sm shadow-slate-400/10">
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
      <div className="rounded-2xl bg-gradient-to-br from-sky-50/95 to-blue-50/80 px-3 py-2 shadow-sm shadow-sky-200/30">
        <p className="text-[10px] font-bold uppercase tracking-wide text-blue-800">Call</p>
        <p className="mt-0.5 text-slate-900">{parsed.call || "—"}</p>
      </div>
      {parsed.watchLines.length > 0 ? (
        <div className="rounded-2xl bg-amber-50/90 px-3 py-2 shadow-sm shadow-amber-200/35">
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-900">Watch</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-slate-800">
            {parsed.watchLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="rounded-2xl bg-emerald-50/90 px-3 py-2 shadow-sm shadow-emerald-200/30">
        <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-900">Next</p>
        <p className="mt-0.5 font-medium text-slate-900">{parsed.next || "—"}</p>
      </div>
      {parsed.integrity ? (
        <p className="rounded-xl bg-amber-50/85 px-2.5 py-1.5 text-xs leading-snug text-amber-950 shadow-sm shadow-amber-200/25">
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
              className="w-full rounded-2xl bg-slate-50/95 px-3 py-2.5 text-left shadow-sm shadow-slate-400/10 transition hover:bg-sky-50/90 focus:outline-none focus:ring-2 focus:ring-sky-400/30"
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
  const [suggestionWalkthrough, setSuggestionWalkthrough] = useState<SuggestionWalkthrough>(null);
  const [pendingProposal, setPendingProposal] = useState<PendingProposal | null>(null);
  const [rejectedProposalTypes, setRejectedProposalTypes] = useState<Array<"table" | "figure">>([]);
  /** Persists emerald tint in the draft during Suggestions (survives clicks outside the textarea). */
  const [suggestionHighlightRange, setSuggestionHighlightRange] = useState<{ start: number; end: number } | null>(null);
  const [proposalHighlightRange, setProposalHighlightRange] = useState<{ start: number; end: number } | null>(null);
  const [draftScroll, setDraftScroll] = useState({ top: 0, left: 0 });

  const autoFullReviewStarted = useRef(false);

  const supervisorTyping =
    loadingReview || chatLoading || staggerDelivering || suggestionWalkthrough?.phase === "loading";

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, supervisorTyping]);

  useEffect(() => {
    if (!suggestionWalkthrough || suggestionWalkthrough.phase !== "active") {
      setSuggestionHighlightRange(null);
    }
  }, [suggestionWalkthrough]);

  function clearJumpTimers() {
    jumpTimersRef.current.forEach((id) => window.clearTimeout(id));
    jumpTimersRef.current = [];
  }

  useEffect(() => () => clearJumpTimers(), []);

  function scheduleJumpTimer(fn: () => void, ms: number) {
    const id = window.setTimeout(fn, ms);
    jumpTimersRef.current.push(id);
  }

  function jumpToTextSnippet(
    snippet?: string,
    opts?: { holdSelectionMs?: number; persistHighlightRange?: boolean },
  ) {
    const rawNeedle = (snippet || "").trim();
    if (!rawNeedle) return;
    const el = editorRef.current;
    if (!el) return;
    const holdSelectionMs = opts?.holdSelectionMs ?? DEFAULT_JUMP_HOLD_MS;
    const persistHighlight = Boolean(opts?.persistHighlightRange);
    clearJumpTimers();
    el.classList.remove("editor-jump-active", "jump-highlight-pulse", "jump-inset-glow");
    if (!persistHighlight) {
      setSuggestionHighlightRange(null);
    }

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
    scrollTextareaRangeIntoView(el, haystack, index, end);
    if (persistHighlight) {
      setSuggestionHighlightRange({ start: index, end });
      setDraftScroll({ top: el.scrollTop, left: el.scrollLeft });
    }
    requestAnimationFrame(() => {
      scrollTextareaRangeIntoView(el, haystack, index, end);
      if (persistHighlight) {
        setDraftScroll({ top: el.scrollTop, left: el.scrollLeft });
      }
    });
    scheduleJumpTimer(() => {
      scrollTextareaRangeIntoView(el, haystack, index, end);
      if (persistHighlight) {
        setDraftScroll({ top: el.scrollTop, left: el.scrollLeft });
      }
      el.classList.add("editor-jump-active");
      el.setSelectionRange(index, end);
      el.classList.add("jump-highlight-pulse");
      scheduleJumpTimer(() => {
        el.classList.remove("jump-highlight-pulse");
        el.classList.add("jump-inset-glow");
      }, 500);
      scheduleJumpTimer(() => {
        el.classList.remove("jump-inset-glow", "editor-jump-active");
      }, holdSelectionMs);
    }, 80);
  }

  function applyApprovedEdit(anchor: string, replacement: string) {
    const a = anchor.trim();
    if (!a) return;
    setSuggestionHighlightRange(null);
    setText((prev) => {
      const m = findAnchorMatchInDraft(prev, a);
      if (!m) {
        queueMicrotask(() =>
          setChatMessages((msgs) => [
            ...msgs,
            {
              role: "assistant",
              kind: "text",
              content:
                "Approve edit failed: the anchor text was not found in your current draft (it may have changed). Try “Jump first”, or shorten the anchor to an exact substring.",
            },
          ]),
        );
        return prev;
      }
      return `${prev.slice(0, m.idx)}${replacement}${prev.slice(m.idx + m.len)}`;
    });
    setDraftStatus("Unsaved");
  }

  function advanceSuggestionWalkthrough(items: SuggestionWalkthroughEdit[], nextIndex: number) {
    if (nextIndex >= items.length) {
      setSuggestionHighlightRange(null);
      setSuggestionWalkthrough(null);
      return;
    }
    setSuggestionHighlightRange(null);
    setSuggestionWalkthrough({ phase: "active", items, index: nextIndex });
    const next = items[nextIndex];
    scheduleJumpTimer(
      () =>
        jumpToTextSnippet(next.anchor_snippet, {
          holdSelectionMs: SUGGESTION_JUMP_HOLD_MS,
          persistHighlightRange: true,
        }),
      120,
    );
  }

  async function startSuggestionWalkthrough() {
    if (text.trim().length < 20) {
      setChatError("Add more draft text first.");
      return;
    }
    if (loadingReview || chatLoading || staggerDelivering) {
      setChatError("Wait for the supervisor to finish, then try Suggestions again.");
      return;
    }

    setSuggestionHighlightRange(null);

    for (let i = chatMessages.length - 1; i >= 0; i--) {
      const m = chatMessages[i];
      if (m.role === "assistant" && m.kind === "supervisor") {
        const edits = m.payload.actions.filter((a) => a.type === "SUGGEST_EDIT");
        if (edits.length > 0) {
          const items: SuggestionWalkthroughEdit[] = edits.map((a) => ({
            id: a.id,
            anchor_snippet: a.anchor_snippet,
            replacement: a.replacement,
            rationale: a.rationale,
          }));
          setSuggestionWalkthrough({ phase: "active", items, index: 0 });
          scheduleJumpTimer(
            () =>
              jumpToTextSnippet(items[0].anchor_snippet, {
                holdSelectionMs: SUGGESTION_JUMP_HOLD_MS,
                persistHighlightRange: true,
              }),
            120,
          );
          return;
        }
      }
    }

    setSuggestionWalkthrough({ phase: "loading" });
    setChatError("");
    try {
      const history = chatMessagesToApiHistory(chatMessages);
      const response = await fetch("/api/supervisor-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: params.id,
          question: "Single suggestion walkthrough for the draft.",
          draftText: text,
          selectedText: selectedText.trim() || undefined,
          chatHistory: history,
          supervisorInteraction: "single_suggestion",
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setChatError(data.error || "Suggestions could not load.");
        setSuggestionWalkthrough(null);
        return;
      }
      if (data.mode === "structured" && data.payload) {
        const payload = data.payload as SupervisorPayload;
        const clarify = payload.actions.find((a) => a.type === "ASK_CLARIFICATION");
        const edits = payload.actions.filter((a) => a.type === "SUGGEST_EDIT");
        if (clarify && edits.length === 0) {
          setSuggestionWalkthrough({ phase: "clarify", question: clarify.question });
          return;
        }
        if (edits.length === 0) {
          setSuggestionWalkthrough({
            phase: "empty",
            hint: "No anchored edit this round. Try a normal chat question or re-run full review.",
          });
          return;
        }
        const items: SuggestionWalkthroughEdit[] = edits.map((a) => ({
          id: a.id,
          anchor_snippet: a.anchor_snippet,
          replacement: a.replacement,
          rationale: a.rationale,
        }));
        setSuggestionWalkthrough({ phase: "active", items, index: 0 });
        scheduleJumpTimer(
          () =>
            jumpToTextSnippet(items[0].anchor_snippet, {
              holdSelectionMs: SUGGESTION_JUMP_HOLD_MS,
              persistHighlightRange: true,
            }),
          120,
        );
        return;
      }
      if (data.mode === "legacy" && typeof data.answer === "string" && data.answer.trim()) {
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", kind: "text", content: data.answer.trim() },
        ]);
      }
      setSuggestionWalkthrough({
        phase: "empty",
        hint:
          data.mode === "legacy"
            ? "No structured edit steps this round (plain-text reply). Use chat or “Full review”, or try Suggestions again."
            : "Supervisor returned plain text for this round — use chat or full review.",
      });
    } catch {
      setChatError("Suggestions request failed.");
      setSuggestionWalkthrough(null);
    }
  }

  async function deliverAssistantBubbles(fullText: string) {
    const parts = splitAssistantIntoBubbles(fullText, 2);
    setStaggerDelivering(true);
    try {
      await wait(jitter(280, 520));
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) await wait(jitter(420, 900));
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
        await wait(jitter(120, 280));
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
    setSuggestionWalkthrough(null);
    setSuggestionHighlightRange(null);
    setProposalHighlightRange(null);
    setPendingProposal(null);
    setRejectedProposalTypes([]);
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
    void startSuggestionWalkthrough();
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

  async function sendSupervisorQuestion(question: string, clearInput: boolean) {
    const normalizedQuestion = question.trim();
    if (normalizedQuestion.length < 4) return;
    if (text.trim().length < 20) {
      setChatError("Add some draft text first.");
      return;
    }

    setChatLoading(true);
    setChatError("");
    const userMessage = { role: "user" as const, content: normalizedQuestion };
    const threadForHistory = [...chatMessages, userMessage];
    setChatMessages((prev) => [...prev, userMessage]);
    if (clearInput) setChatInput("");
    try {
      const history = chatMessagesToApiHistory(threadForHistory);

      const response = await fetch("/api/supervisor-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: params.id,
          question: normalizedQuestion,
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
      if (data.mode === "structured" && data.payload) {
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", kind: "supervisor", payload: data.payload as SupervisorPayload },
        ]);
      } else {
        await deliverAssistantBubbles(String(data.answer || "No response."));
      }
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

  async function onSendSupervisorChat() {
    await sendSupervisorQuestion(chatInput, true);
  }

  function approvePendingProposal() {
    if (!pendingProposal) return;
    const startMarker = pendingProposal.markerStart;
    const endMarker = pendingProposal.markerEnd;
    setText((prev) => prev.replace(startMarker, "").replace(endMarker, "").replace(/\n{3,}/g, "\n\n"));
    setProposalHighlightRange(null);
    setDraftStatus("Unsaved");
    setPendingProposal(null);
    setRejectedProposalTypes([]);
  }

  function rejectPendingProposal() {
    if (!pendingProposal) return;
    setRejectedProposalTypes((prev) => [...prev.slice(-3), pendingProposal.type]);
    setText(pendingProposal.previousDraftBeforeProposal);
    setProposalHighlightRange(null);
    setDraftStatus("Unsaved");
    setPendingProposal(null);
  }

  async function requestGraphTableProposal(requestedType: "table" | "figure") {
    let suggestionType = requestedType;
    let switchNote = "";
    const lastTwo = rejectedProposalTypes.slice(-2);
    if (lastTwo.length === 2 && lastTwo[0] === requestedType && lastTwo[1] === requestedType) {
      suggestionType = requestedType === "table" ? "figure" : "table";
      switchNote = `Last two ${requestedType} suggestions were rejected. Switching to ${suggestionType} for variety.`;
    }
    if (text.trim().length < 20) {
      setChatError("Add more draft text first.");
      return;
    }
    if (pendingProposal) {
      setChatError("Approve or remove the current proposal first.");
      return;
    }
    if (supervisorTyping) {
      setChatError("Wait for the supervisor to finish, then try again.");
      return;
    }
    setChatError(switchNote);
    setChatLoading(true);
    try {
      const response = await fetch("/api/supervisor-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: params.id,
          question: suggestionType === "table" ? "Suggest one insertable table." : "Suggest one insertable graph.",
          draftText: text,
          selectedText: selectedText.trim() || undefined,
          supervisorInteraction: "figure_proposal",
          suggestionType,
          chatHistory: chatMessagesToApiHistory(chatMessages),
        }),
      });
      const data = await response.json();
      if (!response.ok || data.mode !== "figure_proposal" || !data.proposal) {
        setChatError(data.error || "Could not generate an insertable table/figure. Try again.");
        return;
      }
      const proposal = data.proposal as GraphTableProposal;
      const prev = text;
      const editor = editorRef.current;
      const currentCaret = editor ? editor.selectionStart : prev.length;
      const insertIdx = findPreferredGraphInsertIndex(prev, proposal.insertAfterText, currentCaret);
      const proposalId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const startMarker = `% <SCHOLARFLOW_PROPOSAL_START id="${proposalId}">`;
      const endMarker = `% <SCHOLARFLOW_PROPOSAL_END id="${proposalId}">`;
      const wrappedBlock = `${startMarker}\n${proposal.latexBlock.trim()}\n${endMarker}`;
      const prefix = insertIdx > 0 && !prev.slice(0, insertIdx).endsWith("\n") ? "\n\n" : "";
      const suffix = prev.slice(insertIdx).startsWith("\n") ? "\n" : "\n\n";
      const next = `${prev.slice(0, insertIdx)}${prefix}${wrappedBlock}${suffix}${prev.slice(insertIdx)}`;
      const markerIndex = next.indexOf(startMarker);
      console.log("INSERT INDEX:", markerIndex);
      console.log("BLOCK INSERTED:", proposal.latexBlock.slice(0, 100));
      const proposalRange = proposalRangeFromMarkers(next, startMarker, endMarker);
      setText(next);
      if (proposalRange) {
        setProposalHighlightRange(proposalRange);
      } else {
        setProposalHighlightRange(null);
      }
      setPendingProposal({
        id: proposalId,
        type: proposal.type,
        title: proposal.title,
        reason: proposal.reason,
        latexBlock: proposal.latexBlock,
        previousDraftBeforeProposal: prev,
        markerStart: startMarker,
        markerEnd: endMarker,
      });
      setDraftStatus("Unsaved");
      queueMicrotask(() => {
        const el = editorRef.current;
        if (!el) return;
        const range = proposalRangeFromMarkers(next, startMarker, endMarker);
        el.focus();
        if (range) {
          el.setSelectionRange(range.start, Math.min(range.end, range.start + 1));
          scrollTextareaRangeIntoView(el, next, range.start, range.end);
          setDraftScroll({ top: el.scrollTop, left: el.scrollLeft });
          requestAnimationFrame(() => {
            scrollTextareaRangeIntoView(el, next, range.start, range.end);
            setDraftScroll({ top: el.scrollTop, left: el.scrollLeft });
          });
          scheduleJumpTimer(() => {
            scrollTextareaRangeIntoView(el, next, range.start, range.end);
            setDraftScroll({ top: el.scrollTop, left: el.scrollLeft });
          }, 120);
        }
      });
    } catch {
      setChatError("Could not generate an insertable table/figure. Try again.");
    } finally {
      setChatLoading(false);
    }
  }

  async function handleSuggestTable() {
    await requestGraphTableProposal("table");
  }

  async function handleSuggestGraph() {
    await requestGraphTableProposal("figure");
  }

  const walkthroughActive = suggestionWalkthrough?.phase === "active";
  const walkthroughItem =
    walkthroughActive && suggestionWalkthrough.items[suggestionWalkthrough.index]
      ? suggestionWalkthrough.items[suggestionWalkthrough.index]
      : null;

  return (
    <main className="relative isolate flex min-h-[calc(100dvh-2.25rem)] w-full max-w-none flex-col overflow-x-hidden bg-transparent md:min-h-[calc(100dvh-2.75rem)]">
      <div className="relative z-10 flex h-[calc(98dvh-2.25rem)] shrink-0 flex-col px-2 pb-2 pt-0.5 sm:px-4 md:h-[calc(98dvh-2.75rem)] md:px-6 md:pt-1">
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)] xl:grid-cols-[minmax(0,1.12fr)_minmax(320px,0.88fr)]">
        {/* Draft */}
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[2rem] bg-white/72 shadow-lg shadow-slate-400/15 backdrop-blur-md dark:border dark:border-white/10 dark:bg-slate-950/35 dark:shadow-black/35 dark:backdrop-blur-xl">
          <div className="flex shrink-0 items-center justify-between px-4 py-2.5 md:px-5">
            <span className="text-sm font-medium text-slate-800 dark:text-slate-100">Draft</span>
            <span className="text-xs text-slate-500 dark:text-slate-300">
              {loadingDraft ? "Loading…" : savingDraft ? "Saving…" : draftStatus}
            </span>
          </div>
          {pendingProposal ? (
            <div className="mx-4 mb-1 rounded-xl border border-sky-200/70 bg-sky-50/80 px-3 py-1.5 text-[11px] text-sky-900 dark:border-sky-400/30 dark:bg-sky-950/35 dark:text-sky-100 md:mx-5">
              Pending {pendingProposal.type} preview inserted. Proposal markers are visible in draft until you keep/remove.
            </div>
          ) : null}
          <div className="relative min-h-0 flex-1 px-2 pb-2 pt-0 md:px-3">
            {suggestionHighlightRange && suggestionWalkthrough?.phase === "active" && walkthroughItem ? (
              <DraftSuggestionHighlightLayer
                textareaRef={editorRef}
                value={text}
                range={suggestionHighlightRange}
                scrollTop={draftScroll.top}
                scrollLeft={draftScroll.left}
                draftSlice={text.slice(suggestionHighlightRange.start, suggestionHighlightRange.end)}
                replacementText={walkthroughItem.replacement}
              />
            ) : null}
            {proposalHighlightRange ? (
              <DraftSuggestionHighlightLayer
                textareaRef={editorRef}
                value={text}
                range={proposalHighlightRange}
                scrollTop={draftScroll.top}
                scrollLeft={draftScroll.left}
                draftSlice={text.slice(proposalHighlightRange.start, proposalHighlightRange.end)}
                replacementText={text.slice(proposalHighlightRange.start, proposalHighlightRange.end)}
              />
            ) : null}
            <textarea
              ref={editorRef}
              spellCheck={false}
              className="relative z-10 min-h-0 h-full w-full resize-none rounded-[1.25rem] border-0 bg-slate-50/85 px-3 py-3 font-mono text-[13px] leading-relaxed text-slate-900 outline-none ring-0 placeholder:text-slate-500 focus:ring-2 focus:ring-sky-400/20 md:px-4 md:py-4 dark:bg-slate-900/45 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:ring-sky-500/25"
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setDraftStatus("Unsaved");
              }}
              onScroll={(event) => {
                const t = event.currentTarget;
                setDraftScroll({ top: t.scrollTop, left: t.scrollLeft });
              }}
              onSelect={updateSelectionFromTextarea}
              onKeyUp={updateSelectionFromTextarea}
              onMouseUp={updateSelectionFromTextarea}
              placeholder="Your thesis or LaTeX draft…"
            />
          </div>
          <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-3 pt-1 md:px-5">
            <p className="text-[11px] text-slate-500 dark:text-slate-300">
              Highlight text for chat context. Selection-only review:
            </p>
            <button
              type="button"
              onClick={() => void onReviewSelectedText()}
              disabled={supervisorTyping || selectedText.trim().length < 20}
              className="shrink-0 rounded-full bg-slate-800/90 px-3 py-1.5 text-xs font-medium text-white shadow-md transition hover:bg-slate-900 disabled:opacity-40"
            >
              Review selection
            </button>
          </div>
        </div>

        {/* Supervisor chat */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-[2rem] bg-white/72 shadow-lg shadow-slate-400/15 backdrop-blur-md dark:border dark:border-white/10 dark:bg-slate-950/35 dark:shadow-black/35 dark:backdrop-blur-xl">
          <div className="shrink-0 px-4 py-2.5 md:px-5">
            <span className="text-sm font-medium text-slate-800 dark:text-slate-100">Supervisor</span>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 md:px-5">
            {!loadingDraft && text.trim().length < 20 ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">Add at least 20 characters in the draft for an automatic review.</p>
            ) : null}
            {chatMessages.map((message, idx) => {
              const key =
                message.role === "user"
                  ? `u-${idx}`
                  : message.kind === "anchors"
                    ? `a-${idx}`
                    : message.kind === "supervisor"
                      ? `s-${idx}`
                      : `t-${idx}`;
              if (message.role === "user") {
                return (
                  <div
                    key={key}
                    className="ml-auto max-w-[95%] rounded-2xl bg-slate-800/95 px-3 py-2.5 text-sm text-white shadow-md"
                  >
                    {message.content}
                  </div>
                );
              }
              if (message.kind === "anchors") {
                return (
                  <div
                    key={key}
                    className="mr-auto max-w-[min(100%,28rem)] rounded-2xl bg-white/90 px-3 py-2.5 text-sm text-slate-800 shadow-md shadow-slate-400/20 dark:bg-slate-900/75 dark:text-slate-100 dark:shadow-black/35"
                  >
                    <AnchorJumpPanel anchors={message.anchors} onJump={jumpToTextSnippet} />
                  </div>
                );
              }
              if (message.kind === "supervisor") {
                return (
                  <div
                    key={key}
                    className="mr-auto max-w-[min(100%,36rem)] rounded-2xl bg-white/90 px-3 py-2.5 text-sm text-slate-800 shadow-md shadow-slate-400/20 dark:bg-slate-900/75 dark:text-slate-100 dark:shadow-black/35"
                  >
                    <SupervisorMarkdown source={message.payload.reply_markdown} />
                    {message.payload.integrity_reminder ? (
                      <p className="mt-2 rounded-xl bg-amber-50/95 px-2.5 py-2 text-xs leading-relaxed text-amber-950 shadow-sm">
                        {message.payload.integrity_reminder}
                      </p>
                    ) : null}
                    <SupervisorActionsPanel
                      actions={message.payload.actions}
                      onJump={jumpToTextSnippet}
                      onApplyEdit={applyApprovedEdit}
                    />
                  </div>
                );
              }
              return (
                <div
                  key={key}
                  className="mr-auto max-w-[95%] rounded-2xl bg-white/90 px-3 py-2.5 text-sm text-slate-800 shadow-md shadow-slate-400/20 dark:bg-slate-900/75 dark:text-slate-100 dark:shadow-black/35"
                >
                  <SupervisorChatBody content={message.content} onJump={jumpToTextSnippet} />
                </div>
              );
            })}
            {supervisorTyping ? <TypingDotsBubble /> : null}
            <div ref={chatEndRef} />
          </div>

          <div className="shrink-0 px-3 pb-3 pt-2 md:px-4">
            {suggestionWalkthrough?.phase === "loading" ? (
              <div className="mb-2 rounded-2xl bg-slate-100/90 px-3 py-2.5 text-xs text-slate-700 shadow-sm dark:bg-slate-900/70 dark:text-slate-200">
                Fetching one focused suggestion…
              </div>
            ) : null}
            {suggestionWalkthrough?.phase === "clarify" ? (
              <div className="mb-2 space-y-2 rounded-2xl bg-amber-50/95 px-3 py-2.5 shadow-md shadow-amber-200/40">
                <p className="text-[10px] font-bold uppercase tracking-wide text-amber-900/90">Clarification</p>
                <p className="text-sm text-amber-950">{suggestionWalkthrough.question}</p>
                <button
                  type="button"
                  onClick={() => setSuggestionWalkthrough(null)}
                  className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-800 shadow-sm"
                >
                  Dismiss
                </button>
              </div>
            ) : null}
            {suggestionWalkthrough?.phase === "empty" ? (
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-100/90 px-3 py-2.5 shadow-sm dark:bg-slate-900/70">
                <p className="text-xs text-slate-700 dark:text-slate-200">{suggestionWalkthrough.hint}</p>
                <button
                  type="button"
                  onClick={() => setSuggestionWalkthrough(null)}
                  className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-800 shadow-sm dark:bg-slate-800 dark:text-slate-100"
                >
                  OK
                </button>
              </div>
            ) : null}
            {pendingProposal ? (
              <div className="mb-2 space-y-2 rounded-2xl bg-sky-50/85 px-3 py-2.5 shadow-md shadow-sky-200/35 dark:bg-sky-950/30">
                <p className="text-[10px] font-bold uppercase tracking-wide text-sky-900/90">
                  {pendingProposal.type === "table"
                    ? "Candidate table inserted into draft"
                    : "Candidate graph inserted into draft"}
                </p>
                <p className="text-sm font-semibold leading-snug text-slate-900">{pendingProposal.title}</p>
                <p className="text-xs leading-relaxed text-slate-700">{pendingProposal.reason}</p>
                {pendingProposal.type === "figure" ? (
                  <GraphReferencePreview title={pendingProposal.title} caption={pendingProposal.latexBlock} />
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={approvePendingProposal}
                    className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-emerald-800"
                  >
                    Yes — keep
                  </button>
                  <button
                    type="button"
                    onClick={rejectPendingProposal}
                    className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-800 shadow-md hover:bg-slate-50"
                  >
                    No — remove
                  </button>
                </div>
              </div>
            ) : null}
            {walkthroughActive && walkthroughItem ? (
              <div className="mb-2 space-y-2 rounded-2xl bg-teal-50/80 px-3 py-2.5 shadow-md shadow-teal-200/35 dark:bg-teal-950/30">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-teal-900/90">Suggestion</p>
                  <span className="text-[10px] font-medium text-slate-600">
                    {suggestionWalkthrough.index + 1} / {suggestionWalkthrough.items.length}
                  </span>
                </div>
                <p className="text-sm font-medium leading-snug text-slate-900">
                  Here is one suggestion: {suggestionWalkthroughSummary(walkthroughItem.rationale)}
                </p>
                <p className="text-xs leading-relaxed text-slate-600">
                  Hover the lightly shaded passage in your draft for a compact red/green comparison (like Grammarly). Use
                  Yes or No when you’re ready — no need to read the full replacement here.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      applyApprovedEdit(walkthroughItem.anchor_snippet, walkthroughItem.replacement);
                      advanceSuggestionWalkthrough(suggestionWalkthrough.items, suggestionWalkthrough.index + 1);
                    }}
                    className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-emerald-800"
                  >
                    Yes — apply
                  </button>
                  <button
                    type="button"
                    onClick={() => advanceSuggestionWalkthrough(suggestionWalkthrough.items, suggestionWalkthrough.index + 1)}
                    className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-800 shadow-md hover:bg-slate-50"
                  >
                    No — skip
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      jumpToTextSnippet(walkthroughItem.anchor_snippet, {
                        holdSelectionMs: SUGGESTION_JUMP_HOLD_MS,
                        persistHighlightRange: true,
                      })
                    }
                    className="rounded-full bg-slate-100/95 px-3 py-2 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-200/80"
                  >
                    Show in draft
                  </button>
                  <button
                    type="button"
                    onClick={() => setSuggestionWalkthrough(null)}
                    className="ml-auto text-xs font-medium text-slate-500 underline decoration-slate-400 underline-offset-2 hover:text-slate-800"
                  >
                    End walkthrough
                  </button>
                </div>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => void runSupervisorReview(text.trim(), "full")}
              disabled={supervisorTyping || text.trim().length < 20}
              className="mb-2 text-left text-xs text-slate-600 underline decoration-slate-400 underline-offset-2 hover:text-slate-900 disabled:opacity-40 dark:text-slate-300 dark:decoration-slate-500 dark:hover:text-white"
            >
              Re-run full-draft review
            </button>
            <div className="flex flex-wrap items-end gap-2">
              <button
                type="button"
                onClick={() => void startSuggestionWalkthrough()}
                disabled={
                  loadingDraft ||
                  text.trim().length < 20 ||
                  loadingReview ||
                  chatLoading ||
                  staggerDelivering ||
                  suggestionWalkthrough?.phase === "loading"
                }
                className="shrink-0 rounded-full bg-teal-800 px-3 py-2 text-xs font-semibold text-white shadow-md transition hover:bg-teal-900 disabled:opacity-40"
                title="Jump to the draft, light highlight + hover for red/green diff; Yes / No below"
              >
                Suggestions
              </button>
              <button
                type="button"
                onClick={() => void handleSuggestTable()}
                disabled={loadingDraft || text.trim().length < 20 || supervisorTyping || Boolean(pendingProposal)}
                className="shrink-0 rounded-full bg-sky-700 px-3 py-2 text-xs font-semibold text-white shadow-md transition hover:bg-sky-800 disabled:opacity-40 dark:bg-sky-600 dark:hover:bg-sky-500"
                title="Insert a preview candidate table into the draft"
              >
                Suggest table
              </button>
              <button
                type="button"
                onClick={() => void handleSuggestGraph()}
                disabled={loadingDraft || text.trim().length < 20 || supervisorTyping || Boolean(pendingProposal)}
                className="shrink-0 rounded-full bg-indigo-700 px-3 py-2 text-xs font-semibold text-white shadow-md transition hover:bg-indigo-800 disabled:opacity-40 dark:bg-indigo-600 dark:hover:bg-indigo-500"
                title="Insert a preview candidate graph into the draft"
              >
                Suggest graph
              </button>
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
                className="min-h-[44px] min-w-[8rem] flex-1 resize-y rounded-[1.25rem] border-0 bg-slate-100/90 px-3 py-2 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-500 focus:bg-white/95 focus:ring-2 focus:ring-sky-400/25 dark:bg-slate-900/75 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:bg-slate-900/90"
              />
              <button
                type="button"
                onClick={() => void onSendSupervisorChat()}
                disabled={supervisorTyping || chatInput.trim().length < 4}
                className="shrink-0 rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white shadow-md disabled:opacity-40"
              >
                Send
              </button>
            </div>
            {chatError ? <p className="mt-1 text-xs text-red-600">{chatError}</p> : null}
            <p className="mt-2 text-[10px] leading-snug text-slate-500 dark:text-slate-300">
              ThesisPilot supports learning and revision; you remain responsible for integrity rules and final submissions.
            </p>
          </div>
        </div>
        </div>
      </div>

      <div className="h-[40vh] shrink-0" aria-hidden />
      <SiteMarketingFooter compact surface="minimal" className="relative z-10 mt-3 shrink-0" />
    </main>
  );
}
