import { useId } from "react";

const cardShell =
  "sf-landing-panel-depth group relative flex h-full min-h-[20rem] flex-col overflow-hidden rounded-3xl border border-cyan-500/25 bg-white/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_40px_-20px_rgba(14,165,233,0.12),0_20px_56px_-28px_rgba(15,23,42,0.08)] backdrop-blur-xl transition duration-300 ease-out hover:-translate-y-1 hover:shadow-[inset_0_1px_0_rgba(255,255,255,1),0_20px_52px_-18px_rgba(6,182,212,0.14)] md:min-h-[22rem] dark:border-cyan-400/15 dark:bg-slate-950/60 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_16px_48px_-24px_rgba(0,0,0,0.45)] dark:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_24px_64px_-20px_rgba(14,165,233,0.12),0_28px_80px_-28px_rgba(0,0,0,0.5)]";

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M8 6h18l8 8v28a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"
        className="stroke-cyan-400/35"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path d="M26 6v8h8" className="stroke-cyan-400/35" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M12 22h16M12 28h16M12 34h10" className="stroke-slate-500/50" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function ReviseStructureVisual() {
  return (
    <div className="relative mt-auto min-h-[11rem] w-full select-none md:min-h-[12rem]">
      <div className="relative rounded-2xl border border-white/[0.09] bg-slate-900/75 p-3 pt-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] md:p-4">
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-cyan-400/28 bg-cyan-500/[0.12] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-cyan-100/95">
            Anchored feedback
          </span>
        </div>
        <div className="space-y-1.5 pr-2 md:pr-4">
          <div className="h-1 w-[72%] rounded-full bg-slate-600/25" />
          <p className="text-[11px] leading-relaxed text-slate-400 md:text-[12px] md:leading-relaxed">
            Prior work suggests a strong effect; however,{" "}
            <mark className="rounded-sm bg-amber-500/[0.22] px-0.5 py-px font-medium text-amber-100/95 ring-1 ring-amber-400/25">
              Claim too broad for your sample
            </mark>{" "}
            without narrowing the population.
          </p>
          <div className="h-1 w-[55%] rounded-full bg-slate-600/18" />
        </div>

        <div className="pointer-events-none absolute -bottom-1 right-0 max-w-[min(100%,11.5rem)] translate-y-px rounded-xl border border-cyan-400/22 bg-slate-950/95 p-2.5 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.55),0_0_20px_-6px_rgba(34,211,238,0.15)] backdrop-blur-sm md:max-w-[13rem]">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-sky-400/90">Supervisor</p>
          <p className="mt-1 text-[10px] leading-snug text-slate-200/95 md:text-[11px] md:leading-snug">
            Narrow this claim and link it to your evidence.
          </p>
        </div>
      </div>
    </div>
  );
}

function ExportFlowVisual() {
  const raw = useId();
  const gid = `sf-export-${raw.replace(/:/g, "")}`;

  const tiles = [
    { label: "LaTeX", sub: ".tex" },
    { label: "PDF", sub: "print-ready" },
    { label: "Markdown", sub: ".md" },
    { label: "Print", sub: "booklet" },
  ] as const;

  return (
    <div className="relative mt-auto flex min-h-[11rem] w-full items-stretch gap-3 pb-1 md:min-h-[12rem] md:gap-5">
      <div className="relative z-10 flex shrink-0 flex-col justify-end">
        <div className="rounded-xl border border-cyan-400/15 bg-slate-900/60 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <DocumentIcon className="h-11 w-9 text-cyan-400/70 md:h-12 md:w-10" />
        </div>
      </div>

      <div className="relative min-h-[9.5rem] min-w-0 flex-1 md:min-h-[10.5rem]">
        <svg
          className="pointer-events-none absolute bottom-8 left-0 right-0 mx-auto h-28 w-[min(100%,17rem)] overflow-visible md:h-32"
          viewBox="0 0 320 112"
          fill="none"
          aria-hidden
        >
          <defs>
            <linearGradient id={`${gid}-line`} x1="0" y1="56" x2="300" y2="24" gradientUnits="userSpaceOnUse">
              <stop stopColor="rgb(34 211 238)" stopOpacity="0.5" />
              <stop offset="0.45" stopColor="rgb(45 212 191)" stopOpacity="0.28" />
              <stop offset="1" stopColor="rgb(34 211 238)" stopOpacity="0.08" />
            </linearGradient>
          </defs>
          <path
            d="M 8 92 C 56 92 72 44 120 40 C 168 36 200 28 248 22 C 276 18 300 16 312 14"
            stroke={`url(#${gid}-line)`}
            strokeWidth="2.25"
            strokeLinecap="round"
          />
        </svg>

        <div className="relative z-10 flex h-full flex-col justify-between gap-3 pt-1">
          <div className="flex flex-wrap justify-end gap-2 md:justify-end md:gap-2.5">
            {tiles.slice(0, 2).map((t) => (
              <div
                key={t.label}
                className="rounded-xl border border-white/[0.1] bg-slate-900/65 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] md:px-3"
              >
                <p className="text-center text-[11px] font-bold tracking-tight text-white md:text-xs">{t.label}</p>
                <p className="mt-0.5 text-center text-[9px] text-slate-500">{t.sub}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap justify-end gap-2 md:gap-2.5">
            {tiles.slice(2).map((t) => (
              <div
                key={t.label}
                className="rounded-xl border border-white/[0.1] bg-slate-900/65 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] md:px-3"
              >
                <p className="text-center text-[11px] font-bold tracking-tight text-white md:text-xs">{t.label}</p>
                <p className="mt-0.5 text-center text-[9px] text-slate-500">{t.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingTwoUpVisualFeatureCards() {
  return (
    <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-2 md:items-stretch">
      <article className={cardShell}>
        <div className="sf-landing-panel-depth__underglow" aria-hidden />
        <div className="sf-landing-panel-depth__topshine" aria-hidden />
        <div className="sf-landing-panel-depth__body flex min-h-0 flex-1 flex-col p-6 md:p-7">
          <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white md:text-2xl">Revise with structure</h3>
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-slate-600 dark:text-slate-400/95 md:mt-4 md:text-base md:leading-relaxed">
            ThesisPilot turns vague feedback into clear thesis edits, anchored to the exact paragraph.
          </p>
          <ReviseStructureVisual />
        </div>
      </article>

      <article className={cardShell}>
        <div className="sf-landing-panel-depth__underglow" aria-hidden />
        <div className="sf-landing-panel-depth__topshine" aria-hidden />
        <div className="sf-landing-panel-depth__body flex min-h-0 flex-1 flex-col p-6 md:p-7">
          <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white md:text-2xl">Export without retyping</h3>
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-slate-600 dark:text-slate-400/95 md:mt-4 md:text-base md:leading-relaxed">
            Move your thesis into your department&apos;s workflow with clean exports for LaTeX, PDF, Markdown, and print.
          </p>
          <ExportFlowVisual />
        </div>
      </article>
    </div>
  );
}
