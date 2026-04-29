import LandingFeaturePanelShell from "@/components/LandingFeaturePanelShell";
import {
  landingFeaturePanelSection,
  landingFeaturePanelSubtitle,
  landingFeaturePanelTitle,
  landingFeaturePanelVisualGap,
} from "@/lib/landing-ui";

/**
 * Second paired feature panel: documents + supervisor overlay (same chrome as thesis-flow panel).
 */
export default function LandingFullThesisFeaturePanel() {
  return (
    <section className={landingFeaturePanelSection}>
      <LandingFeaturePanelShell>
        <div className="text-left">
          <h2 className={landingFeaturePanelTitle}>Full thesis generation</h2>
          <p className={landingFeaturePanelSubtitle}>
            ThesisPilot turns your uploaded sources into a structured BSc or MSc thesis draft, including citations, equations, figures, tables, appendices, and export-ready formatting.
          </p>
        </div>

        <div
          className={`${landingFeaturePanelVisualGap} relative overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-100/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:border-white/[0.08] dark:bg-slate-900/45 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]`}
        >
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-cyan-500/[0.04] via-transparent to-teal-900/[0.06]"
            aria-hidden
          />

          <div className="relative flex min-h-[180px] items-center justify-center p-4 md:min-h-[180px] md:p-5">
            <div className="grid w-full max-w-4xl grid-cols-1 items-center gap-5 md:grid-cols-[minmax(0,0.36fr)_minmax(0,1fr)] md:gap-6">
              {/* Stacked papers */}
              <div className="relative mx-auto h-[156px] w-[168px] shrink-0 md:mx-0 md:h-[148px] md:w-full md:max-w-[180px]">
                <PaperSheet className="left-0 top-0 z-[1] -rotate-[6deg]" lines={5} citeLine={2} />
                <PaperSheet className="left-2.5 top-4 z-[2] rotate-[4deg]" lines={4} citeLine={2} />
                <PaperSheet className="left-5 top-8 z-[3] -rotate-[2deg]" lines={6} citeLine={3} />
                <PaperSheet className="left-8 top-[2.65rem] z-[4] rotate-[3deg]" lines={4} citeLine={2} />
              </div>

              {/* Draft + floating supervisor */}
              <div className="relative min-h-0 min-w-0 md:pl-1">
                <div className="relative rounded-xl border border-cyan-400/18 bg-slate-950/55 p-3 pt-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] md:p-4 md:pt-5">
                  <div className="mb-2 flex flex-wrap gap-1">
                    <span className="rounded border border-emerald-400/25 bg-emerald-500/[0.08] px-1.5 py-px text-[8px] font-semibold uppercase tracking-wide text-emerald-200/90">
                      Source grounded
                    </span>
                    <span className="rounded border border-amber-400/30 bg-amber-500/[0.1] px-1.5 py-px text-[8px] font-semibold uppercase tracking-wide text-amber-100/90">
                      Citations included
                    </span>
                    <span className="rounded border border-cyan-400/28 bg-cyan-500/[0.1] px-1.5 py-px text-[8px] font-semibold uppercase tracking-wide text-cyan-100/90">
                      STEM ready
                    </span>
                    <span className="rounded border border-indigo-400/28 bg-indigo-500/[0.1] px-1.5 py-px text-[8px] font-semibold uppercase tracking-wide text-indigo-100/90">
                      Figures + tables
                    </span>
                    <span className="rounded border border-violet-400/28 bg-violet-500/[0.1] px-1.5 py-px text-[8px] font-semibold uppercase tracking-wide text-violet-100/90">
                      Math notation
                    </span>
                  </div>

                  <div className="rounded-lg border border-sky-500/20 bg-sky-950/25 px-2.5 py-1.5 ring-1 ring-cyan-400/15">
                    <p className="text-[10px] font-bold tracking-tight text-cyan-100 md:text-[11px]">Chapter 3: Methodology</p>
                  </div>

                  <div className="mt-2.5 space-y-1.5">
                    <div className="h-0.5 w-full max-w-[95%] rounded-full bg-slate-600/35" />
                    <div className="h-0.5 w-[88%] rounded-full bg-slate-600/25" />
                    <div className="h-0.5 w-[72%] rounded-full bg-slate-600/22" />
                    <div className="h-0.5 w-[60%] rounded-full bg-slate-600/18" />
                  </div>
                </div>

                <div className="relative z-10 mt-3 md:absolute md:-top-1 md:right-2 md:mt-0 md:w-[min(100%,248px)] lg:right-3">
                  <div className="rounded-lg border border-cyan-400/25 bg-slate-950/92 p-2.5 shadow-[0_10px_32px_-12px_rgba(0,0,0,0.65),0_0_24px_-8px_rgba(34,211,238,0.22)] backdrop-blur-md">
                    <div className="flex items-center gap-1 border-b border-white/[0.06] pb-1.5">
                      <span className="text-[9px] text-cyan-400" aria-hidden>
                        ✦
                      </span>
                      <span className="text-[9px] font-bold uppercase tracking-wide text-sky-300/95">Supervisor</span>
                    </div>
                    <p className="mt-1.5 text-[9px] leading-snug text-slate-200 md:text-[10px] md:leading-snug">
                      Strengthen this section by linking the model specification to your research question and cited sources.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-3 text-right text-[10px] leading-snug text-slate-500/95 md:text-[11px]">
          Generate, revise, and export — with your sources still in the loop.
        </p>
      </LandingFeaturePanelShell>
    </section>
  );
}

function PaperSheet({
  className,
  lines,
  citeLine,
}: {
  className: string;
  lines: number;
  citeLine: number;
}) {
  return (
    <div
      className={`absolute h-[6.5rem] w-[6.25rem] rounded-sm border border-slate-400/20 bg-slate-100/[0.07] shadow-[0_6px_18px_-6px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)] sm:h-[6.75rem] sm:w-[6.4rem] ${className}`}
    >
      <div className="border-b border-slate-500/25 px-1.5 py-0.5">
        <div className="h-0.5 w-6 rounded-full bg-slate-500/35" />
      </div>
      <div className="space-y-1 px-1.5 py-1.5">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`h-0.5 rounded-full ${
              i + 1 === citeLine ? "bg-amber-400/35 ring-1 ring-amber-400/20" : "bg-sky-500/22"
            }`}
            style={{ width: `${68 + (i % 4) * 8}%` }}
          />
        ))}
      </div>
    </div>
  );
}
