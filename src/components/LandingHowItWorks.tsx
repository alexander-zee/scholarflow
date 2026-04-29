import { FilePenLine, FileOutput, FileStack, ListTree, type LucideIcon } from "lucide-react";

const steps: { n: number; title: string; body: string; Icon: LucideIcon; accent: "dot-bl" | "dash" | "square" | "dot-tr" }[] = [
  {
    n: 1,
    title: "Upload sources",
    body: "Add papers, references, PDFs, notes, and web sources to your thesis workspace.",
    Icon: FileStack,
    accent: "dot-bl",
  },
  {
    n: 2,
    title: "Generate full thesis",
    body: "ThesisPilot creates structured chapters with citations, equations, figures, tables, and appendices.",
    Icon: ListTree,
    accent: "dash",
  },
  {
    n: 3,
    title: "Review and refine",
    body: "Use the AI Supervisor to scope claims, improve logic, add missing citations, and revise weak sections.",
    Icon: FilePenLine,
    accent: "square",
  },
  {
    n: 4,
    title: "Export cleanly",
    body: "Move your thesis to LaTeX, PDF, Markdown, or print without retyping.",
    Icon: FileOutput,
    accent: "dot-tr",
  },
];

const stats = [
  {
    value: "Full",
    headline: "Thesis draft",
    detail: "Chapters, citations, figures",
  },
  {
    value: "4+",
    headline: "Export formats",
    detail: "PDF, Markdown, LaTeX, print",
  },
  {
    value: "0",
    headline: "Retyping",
    detail: "Clean handoff to your workflow",
  },
] as const;

function OrbAccent({ kind }: { kind: (typeof steps)[number]["accent"] }) {
  if (kind === "dot-bl") {
    return (
      <span
        className="pointer-events-none absolute bottom-3 left-3 z-0 h-1.5 w-1.5 rounded-full bg-cyan-400/75 shadow-[0_0_10px_rgba(34,211,238,0.5)] ring-1 ring-cyan-300/40"
        aria-hidden
      />
    );
  }
  if (kind === "dash") {
    return (
      <span
        className="pointer-events-none absolute left-4 top-4 z-0 h-px w-5 rounded-full bg-gradient-to-r from-cyan-400/60 to-transparent"
        aria-hidden
      />
    );
  }
  if (kind === "square") {
    return (
      <span
        className="pointer-events-none absolute right-5 top-5 z-0 h-2 w-2 rotate-12 rounded-sm border border-cyan-400/45 bg-cyan-500/15"
        aria-hidden
      />
    );
  }
  return (
    <span
      className="pointer-events-none absolute right-4 top-4 z-0 h-1 w-1 rounded-full bg-teal-400/80 ring-1 ring-teal-300/35"
      aria-hidden
    />
  );
}

function StepOrb({ n, Icon, accent }: { n: number; Icon: LucideIcon; accent: (typeof steps)[number]["accent"] }) {
  return (
    <div className="relative z-10 mx-auto flex h-24 w-24 shrink-0 items-center justify-center rounded-full border border-cyan-400/35 bg-gradient-to-br from-white via-slate-100 to-cyan-50/90 shadow-[0_12px_40px_-16px_rgba(14,165,233,0.2),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl dark:border-cyan-300/20 dark:from-slate-900/95 dark:via-slate-950/90 dark:to-cyan-950/40 dark:shadow-[0_0_65px_rgba(34,211,238,0.20),inset_0_0_28px_rgba(34,211,238,0.09)]">
      <span
        className="pointer-events-none absolute inset-3 rounded-full bg-cyan-400/10 blur-xl"
        aria-hidden
      />
      <OrbAccent kind={accent} />
      <Icon className="relative z-[1] h-10 w-10 text-cyan-600 dark:text-cyan-300 md:h-11 md:w-11" strokeWidth={1.8} aria-hidden />
      <span
        className="absolute right-1 top-1 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-cyan-200/50 bg-slate-50 text-xs font-bold text-slate-950 shadow-[0_0_20px_rgba(34,211,238,0.25)]"
        aria-hidden
      >
        {n}
      </span>
    </div>
  );
}

/**
 * Centered four-step process — premium orbs, layered connector, cyan-only accents.
 */
export default function LandingHowItWorks() {
  return (
    <section className="overflow-hidden border-y border-slate-200/80 py-16 text-slate-900 dark:border-white/[0.06] dark:text-white md:py-20">
      <div className="mx-auto max-w-6xl px-6 text-center">
        <h2 className="text-4xl font-semibold leading-[1.05] tracking-[-0.04em] text-slate-950 dark:text-white sm:text-5xl md:text-6xl">
          How it works — from sources to thesis.
        </h2>
        <p className="mx-auto mt-5 max-w-3xl text-lg leading-relaxed text-slate-600 dark:text-slate-400 md:text-xl">
          Upload your material, generate a full thesis, refine it with supervisor-style feedback, and export in the format your department expects.
        </p>

        <div className="relative mx-auto mt-20 w-full overflow-visible">
          {/* Radial drama + faint grid */}
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[900px] max-w-[min(900px,200vw)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/[0.06] blur-[120px]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.28]"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(148,163,184,0.055) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.055) 1px, transparent 1px)",
              backgroundSize: "52px 52px",
            }}
            aria-hidden
          />

          {/* Two-layer connector — desktop, behind orbs (center of h-24 orbs) */}
          <div
            className="pointer-events-none absolute left-[8%] right-[8%] top-12 z-0 hidden h-px overflow-visible md:block"
            aria-hidden
          >
            <div className="absolute inset-0 bg-cyan-400/10" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-300/40 to-transparent blur-[1px]" />
          </div>

          <ol className="relative z-10 grid list-none grid-cols-1 gap-12 p-0 md:grid-cols-4 md:gap-16">
            {steps.map(({ n, title, body, Icon, accent }) => (
              <li key={n} className="relative mx-auto flex max-w-[250px] flex-col items-center text-center">
                <StepOrb n={n} Icon={Icon} accent={accent} />
                <h3 className="mt-7 text-lg font-semibold tracking-tight text-slate-900 dark:text-white md:text-xl">{title}</h3>
                <p className="mt-3 text-[15px] leading-7 text-slate-600 dark:text-slate-400 md:text-base">{body}</p>
              </li>
            ))}
          </ol>
        </div>

        {/* Stats row — proof strip */}
        <div className="mx-auto mt-24 max-w-4xl border-t border-slate-200/80 pt-12 dark:border-white/[0.06]">
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
            {stats.map((s) => (
              <div
                key={s.headline}
                className="relative px-8 text-center after:pointer-events-none after:absolute after:right-0 after:top-2 after:hidden after:h-16 after:w-px after:bg-slate-200/90 after:content-[''] sm:after:block last:sm:after:hidden dark:after:bg-white/[0.08]"
              >
                <p className="text-5xl font-semibold leading-none tracking-[-0.05em] text-slate-950 drop-shadow-sm dark:text-white dark:drop-shadow-[0_0_18px_rgba(34,211,238,0.18)] md:text-6xl">
                  {s.value}
                </p>
                <p className="mt-4 text-sm font-medium text-slate-700 dark:text-slate-300 md:text-base">{s.headline}</p>
                <p className="mt-2 text-sm text-slate-500">{s.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
