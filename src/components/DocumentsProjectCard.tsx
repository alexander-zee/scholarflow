"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";

type DocumentsProjectCardProps = {
  projectId: string;
  title: string;
  field: string;
  degreeLevel: string;
  language: string;
  canExport: boolean;
};

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 4v12" />
      <path d="M8 12l4 4 4-4" />
      <path d="M4 20h16" />
    </svg>
  );
}

function DocIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}

const actionIconClass =
  "flex h-12 w-12 items-center justify-center rounded-full bg-white/95 text-cyan-700 shadow-sm ring-1 ring-cyan-200/60 transition group-hover:bg-white group-hover:ring-cyan-300/70 dark:bg-white/15 dark:text-white dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] dark:ring-0 dark:ring-transparent dark:group-hover:bg-white/25";

const actionLabelClass = "text-center text-xs font-semibold text-slate-800 dark:text-white";

function ActionButton({
  href,
  label,
  icon,
  disabled,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <div className="flex flex-col items-center gap-2 opacity-45">
        <span className={`${actionIconClass} grayscale`}>{icon}</span>
        <span className={`${actionLabelClass} font-medium opacity-80`}>{label}</span>
      </div>
    );
  }
  return (
    <a
      href={href}
      download
      className="group flex flex-col items-center gap-2 rounded-xl p-1 transition hover:bg-slate-900/[0.04] dark:hover:bg-white/10"
    >
      <span className={actionIconClass}>{icon}</span>
      <span className={actionLabelClass}>{label}</span>
    </a>
  );
}

function NavAction({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col items-center gap-2 rounded-xl p-1 transition hover:bg-slate-900/[0.04] dark:hover:bg-white/10"
    >
      <span className={actionIconClass}>{children}</span>
      <span className={actionLabelClass}>{label}</span>
    </Link>
  );
}

export default function DocumentsProjectCard({
  projectId,
  title,
  field,
  degreeLevel,
  language,
  canExport,
}: DocumentsProjectCardProps) {
  const base = `/api/projects/${projectId}/export`;
  const [pdfModeBadge, setPdfModeBadge] = useState<"checking" | "latex" | "fallback">("checking");

  useEffect(() => {
    let cancelled = false;
    async function checkPdfMode() {
      try {
        const res = await fetch(`${base}?format=pdf&probe=1`, { cache: "no-store" });
        const json = (await res.json()) as { mode?: string };
        if (cancelled) return;
        setPdfModeBadge(json.mode === "tectonic" || json.mode === "pdflatex" ? "latex" : "fallback");
      } catch {
        if (cancelled) return;
        setPdfModeBadge("fallback");
      }
    }
    checkPdfMode();
    return () => {
      cancelled = true;
    };
  }, [base]);

  return (
    <article className="relative flex min-h-[280px] flex-col overflow-hidden rounded-3xl border border-cyan-200/50 bg-gradient-to-br from-white via-sky-50/90 to-cyan-50/80 p-5 text-slate-900 shadow-[0_20px_56px_-28px_rgba(14,165,233,0.18),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl dark:border-cyan-400/18 dark:from-slate-900/92 dark:via-[#0b2844]/95 dark:to-cyan-950/55 dark:text-white dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_28px_72px_-28px_rgba(0,0,0,0.55),0_0_56px_-22px_rgba(34,211,238,0.14)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-40 dark:opacity-100"
        aria-hidden
      >
        <div className="absolute -right-8 -top-12 h-40 w-40 rounded-full bg-cyan-400/25 blur-3xl dark:bg-cyan-400/15" />
        <div className="absolute -bottom-10 -left-6 h-36 w-36 rounded-full bg-sky-300/30 blur-3xl dark:bg-sky-500/10" />
      </div>

      <header className="relative z-[1] mb-4 min-h-[3rem]">
        <h3 className="line-clamp-2 text-lg font-bold leading-snug tracking-tight text-slate-900 dark:text-white" title={title}>
          {title}
        </h3>
        <p className="mt-1 line-clamp-1 text-xs font-medium text-slate-600 dark:text-white/85">
          {field} · {degreeLevel} · {language}
        </p>
      </header>

      <div className="relative z-[1] grid flex-1 grid-cols-2 gap-x-2 gap-y-4 sm:gap-x-3">
        <ActionButton href={`${base}?format=pdf`} label="PDF" icon={<DownloadIcon className="h-5 w-5" />} disabled={!canExport} />
        <ActionButton href={`${base}?format=word`} label="Word" icon={<DocIcon className="h-5 w-5" />} disabled={!canExport} />
        <ActionButton href={`${base}?format=md`} label="Markdown" icon={<DownloadIcon className="h-5 w-5" />} disabled={!canExport} />
        <ActionButton href={`${base}?format=tex`} label="LaTeX" icon={<DocIcon className="h-5 w-5" />} disabled={!canExport} />
        <ActionButton href={`${base}?format=txt`} label="Text" icon={<DownloadIcon className="h-5 w-5" />} disabled={!canExport} />
        <NavAction href={`/dashboard/projects/${projectId}`} label="Workspace">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </NavAction>
        <NavAction href={`/dashboard/projects/${projectId}/review`} label="Studio">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
        </NavAction>
        <NavAction href={`/dashboard/projects/${projectId}/print`} label="Print">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" />
          </svg>
        </NavAction>
      </div>

      {!canExport ? (
        <p className="relative z-[1] mt-4 text-center text-[11px] font-medium text-slate-600 dark:text-white/80">
          Generate an outline or draft in the workspace to enable downloads.
        </p>
      ) : (
        <div className="relative z-[1] mt-4 flex flex-col items-center gap-2">
          <p className="text-center text-[11px] text-slate-600 dark:text-white/70">
            Word downloads as an RTF file you can open in Microsoft Word.
          </p>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              pdfModeBadge === "latex"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100"
                : pdfModeBadge === "fallback"
                  ? "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100"
                  : "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-200"
            }`}
          >
            {pdfModeBadge === "latex" ? "PDF mode: LaTeX compiled" : pdfModeBadge === "fallback" ? "PDF mode: fallback possible" : "PDF mode: checking"}
          </span>
        </div>
      )}
    </article>
  );
}
