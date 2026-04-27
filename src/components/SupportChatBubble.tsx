"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

/** Professional smiling support portrait; initials fallback if image fails. */
const SUPPORT_AVATAR =
  "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&w=320&h=320&q=80";

type SupportChatBubbleProps = {
  side?: "left" | "right";
  showLabel?: boolean;
};

export default function SupportChatBubble({ side = "right", showLabel = false }: SupportChatBubbleProps) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [avatarOk, setAvatarOk] = useState(true);
  const [message, setMessage] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [statusText, setStatusText] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => setOpen(false), []);
  const launcherSizeClass = showLabel ? "px-3 py-2" : "h-16 w-16";
  const iconSizeClass = showLabel ? "h-6 w-6" : "h-8 w-8";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || launcherRef.current?.contains(t)) return;
      close();
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open, close]);

  const alignClass = side === "left" ? "left-0 items-start" : "right-0 items-end";
  const originClass = side === "left" ? "origin-bottom-left" : "origin-bottom-right";

  async function onSendSupportMessage() {
    const trimmed = message.trim();
    if (trimmed.length < 5) {
      setStatusText("Please write a bit more before sending.");
      return;
    }

    setSending(true);
    setStatusText("");
    try {
      const formData = new FormData();
      formData.append("message", trimmed);
      if (attachment) formData.append("attachment", attachment);

      const response = await fetch("/api/support/contact", {
        method: "POST",
        body: formData,
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setStatusText(json.error || "Could not send your message right now.");
        return;
      }

      setMessage("");
      setAttachment(null);
      setStatusText("Thank you for your message. We aim to get back to you ASAP.");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      setStatusText("Could not send your message right now.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={`pointer-events-none fixed bottom-0 z-[70] flex flex-col gap-3 p-4 md:p-6 ${alignClass}`}>
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${panelId}-title`}
          className={`pointer-events-auto flex min-h-[37rem] w-[min(100vw-2rem,24rem)] flex-col ${originClass} rounded-2xl border border-slate-200/90 bg-white text-slate-900 shadow-2xl dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100`}
        >
          <div className="sf-support-panel-enter flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-700">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-100">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Chat with us — we&apos;re online
            </div>
            <button
              type="button"
              onClick={close}
              className="rounded-full p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="Close chat"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="sf-support-content-enter flex-1 px-4 pb-4 pt-5 text-center">
            <div className="relative mx-auto h-20 w-20">
              {avatarOk ? (
                <img
                  src={SUPPORT_AVATAR}
                  alt=""
                  width={80}
                  height={80}
                  className="h-20 w-20 rounded-full object-cover object-center ring-4 ring-white shadow-md dark:ring-slate-800"
                  onError={() => setAvatarOk(false)}
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-slate-200 to-slate-300 text-2xl font-bold text-slate-600 ring-4 ring-white dark:from-slate-600 dark:to-slate-700 dark:text-slate-200 dark:ring-slate-800">
                  AM
                </div>
              )}
              <span className="absolute bottom-1 right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900" />
            </div>
            <h2 id={`${panelId}-title`} className="mt-3 text-lg font-bold text-slate-900 dark:text-white">
              Ava Mitchell
            </h2>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Academic Support Advisor</p>
            <p className="mt-7 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Hello, welcome to ScholarFlow support. Please write your question in English.
              We get back to you within 12h, usually sooner.
            </p>
          </div>

          <div className="sf-support-input-enter mt-auto border-t border-slate-100 px-3 py-2 dark:border-slate-700">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-600 dark:bg-slate-800/80">
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={1}
                placeholder="Message…"
                className="min-h-[40px] flex-1 resize-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-200"
                aria-label="Message support"
              />
              <span className="flex shrink-0 gap-1 text-slate-400">
                <span className="rounded p-1" title="Emoji (demo)">
                  🙂
                </span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded p-1 transition hover:bg-slate-100 hover:text-slate-600"
                  title="Attach file"
                  aria-label="Attach file"
                >
                  📎
                </button>
                <button
                  type="button"
                  onClick={onSendSupportMessage}
                  disabled={sending}
                  className="rounded p-1 text-sky-600 transition hover:bg-slate-100 disabled:opacity-60"
                  title="Send message"
                  aria-label="Send message"
                >
                  ➜
                </button>
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              onChange={(event) => setAttachment(event.target.files?.[0] || null)}
            />
            {attachment ? (
              <p className="mt-2 text-xs text-slate-500">
                Attached: <span className="font-medium">{attachment.name}</span>
              </p>
            ) : null}
            {statusText ? (
              <p className="mt-2 text-xs font-medium text-emerald-700">{statusText}</p>
            ) : null}
            <p className="mt-2 text-center text-[10px] text-slate-400 dark:text-slate-500">ScholarFlow · support</p>
          </div>
        </div>
      ) : null}

      <button
        ref={launcherRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`pointer-events-auto inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-lg shadow-blue-900/30 transition hover:brightness-110 focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/70 ${launcherSizeClass}`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={open ? "Close support chat" : "Open support chat"}
      >
        <svg className={iconSizeClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8.5z" />
        </svg>
        {showLabel ? <span className="pr-1 text-xs font-semibold tracking-wide">Message us</span> : null}
      </button>
    </div>
  );
}


