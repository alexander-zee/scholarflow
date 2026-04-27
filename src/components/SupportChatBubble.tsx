"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

/** Stock-style portrait (pravatar); initials fallback if it fails to load. */
const SUPPORT_AVATAR = "https://i.pravatar.cc/160?img=47";

type SupportChatBubbleProps = {
  side?: "left" | "right";
  showLabel?: boolean;
};

export default function SupportChatBubble({ side = "right", showLabel = false }: SupportChatBubbleProps) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [avatarOk, setAvatarOk] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

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

  return (
    <div className={`pointer-events-none fixed bottom-0 z-[70] flex flex-col gap-3 p-4 md:p-6 ${alignClass}`}>
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${panelId}-title`}
          className={`pointer-events-auto w-[min(100vw-2rem,22rem)] ${originClass} rounded-2xl border border-slate-200/90 bg-white text-slate-900 shadow-2xl dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100`}
        >
          <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-700">
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

          <div className="px-4 pb-4 pt-5 text-center">
            <div className="relative mx-auto h-20 w-20">
              {avatarOk ? (
                <img
                  src={SUPPORT_AVATAR}
                  alt=""
                  width={80}
                  height={80}
                  className="h-20 w-20 rounded-full object-cover ring-4 ring-white shadow-md dark:ring-slate-800"
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
              Ava M.
            </h2>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Support advisor</p>
            <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Hi — welcome to ScholarFlow. This is a demo chat window (no messages are sent yet). Tell us what you&apos;re working on
              and we&apos;ll route it to the right channel when live support is wired up.
            </p>
          </div>

          <div className="border-t border-slate-100 px-3 py-2 dark:border-slate-700">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-600 dark:bg-slate-800/80">
              <textarea
                readOnly
                rows={1}
                placeholder="Message…"
                className="min-h-[40px] flex-1 resize-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-200"
                aria-label="Message (demo)"
              />
              <span className="flex shrink-0 gap-1 text-slate-400">
                <span className="rounded p-1" title="Emoji (demo)">
                  🙂
                </span>
                <span className="rounded p-1" title="Attach (demo)">
                  📎
                </span>
              </span>
            </div>
            <p className="mt-2 text-center text-[10px] text-slate-400 dark:text-slate-500">ScholarFlow · preview UI</p>
          </div>
        </div>
      ) : null}

      <button
        ref={launcherRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 px-3 py-2 text-white shadow-lg shadow-blue-900/30 transition hover:brightness-110 focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/70"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={open ? "Close support chat" : "Open support chat"}
      >
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8.5z" />
        </svg>
        {showLabel ? <span className="pr-1 text-xs font-semibold tracking-wide">Message us</span> : null}
      </button>
    </div>
  );
}


