import { landingGlassPanel } from "@/lib/landing-ui";

/**
 * Hero product mock: draft + supervisor — glass centerpiece, readable type, no visible scrollbars.
 */
export default function LandingProductPreview({ className = "" }: { className?: string }) {
  return (
    <div className={`sf-landing-preview-shell relative z-0 min-w-0 rounded-3xl ${className}`.trim()}>
      <div
        className={`sf-landing-panel-depth relative z-10 overflow-hidden rounded-3xl ring-1 ring-inset ring-slate-400/45 shadow-[0_0_0_1px_rgba(15,23,42,0.05),0_28px_70px_-32px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.92)] dark:ring-cyan-400/25 dark:shadow-[0_0_0_1px_rgba(34,211,238,0.12),0_0_100px_-24px_rgba(34,211,238,0.35),0_32px_90px_-32px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.18),0_30px_120px_-40px_rgba(14,165,233,0.08)] ${landingGlassPanel}`}
      >
        <div className="sf-landing-panel-depth__underglow" aria-hidden />
        <div className="sf-landing-panel-depth__topshine" aria-hidden />
        <div className="sf-landing-panel-depth__body relative z-10 min-h-0">
          <div className="sf-landing-preview-edge-gloss rounded-3xl" aria-hidden>
            <span />
          </div>

          <div className="relative z-10 grid min-h-[22rem] min-w-0 lg:min-h-[min(36rem,58vh)] lg:grid-cols-[1.12fr_0.88fr]">
          {/* Draft column */}
          <div className="flex min-h-0 min-w-0 flex-col border-b border-slate-200/80 lg:border-b-0 lg:border-r lg:border-slate-200/80 dark:border-white/10 dark:lg:border-white/10">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200/80 px-4 py-3 dark:border-white/[0.08] md:px-5">
              <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-200">Draft</span>
              <span className="text-[11px] text-slate-500">Saved</span>
            </div>
            <div className="min-h-0 min-w-0 flex-1 bg-slate-100/80 p-3.5 dark:bg-slate-950/35 md:p-5">
              <div className="sf-scrollbar-hide h-full min-w-0 overflow-hidden rounded-xl border border-slate-200/90 bg-slate-900/90 p-3.5 font-mono text-[12px] leading-relaxed text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] dark:border-white/[0.08] dark:bg-slate-900/45 dark:text-slate-400 md:text-[13px] md:leading-relaxed">
                <p className="text-slate-500">
                  <span className="text-slate-600">\section</span>{" "}
                  <span className="text-sky-400/85">{"{Introduction}"}</span>
                </p>
                <p className="mt-3 text-pretty text-slate-300">
                  We hypothesize that the intervention improves retention under the conditions described in Chen et al.…
                </p>
                <p className="mt-2.5 text-pretty border-l-2 border-amber-400/50 bg-amber-500/[0.1] pl-2.5 pr-2 py-1.5 text-amber-100/95 shadow-[0_0_22px_-6px_rgba(251,191,36,0.2)] ring-1 ring-amber-400/12">
                  Scope this claim to your sample and cite the primary outcome from your uploaded PDFs.
                </p>
                <p className="mt-3 text-pretty text-slate-500">
                  Methods follow institutional guidelines; limitations are addressed in §4.
                </p>
              </div>
            </div>
          </div>

          {/* Supervisor column */}
          <div className="flex min-h-0 min-w-0 flex-col bg-slate-50/90 dark:bg-slate-950/25">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200/80 px-4 py-3 dark:border-white/[0.08] md:px-5">
              <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-200">Supervisor</span>
              <span className="shrink-0 rounded-full border border-cyan-400/35 bg-cyan-500/[0.14] px-2.5 py-0.5 text-[11px] font-semibold text-cyan-100 shadow-[0_0_18px_-4px_rgba(34,211,238,0.35)]">
                Reviewed 3 issues
              </span>
            </div>
            <div className="sf-scrollbar-hide flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden p-3.5 md:p-5">
              <div className="min-w-0 overflow-hidden rounded-xl border border-cyan-400/22 bg-white/[0.08] px-3.5 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_28px_-10px_rgba(34,211,238,0.18)] ring-1 ring-cyan-300/12">
                <p className="text-[11px] font-bold uppercase tracking-wide text-sky-400/95">Structured review</p>
                <p className="mt-2 text-pretty text-[13px] leading-relaxed text-slate-300 md:text-sm">
                  Strengthen the hypothesis: tie the outcome to one measurable from your references, then add the missing
                  citation marker where indicated.
                </p>
              </div>
              <div className="sf-landing-supervisor-pulse min-w-0 overflow-hidden rounded-xl border border-emerald-400/28 bg-emerald-950/35 px-3.5 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-400/95">Anchored comment</p>
                <p className="mt-2 text-pretty text-[13px] leading-relaxed text-slate-300 md:text-sm">
                  Jump to sentence 2 in §2 — suggest a narrower operational definition before you expand the literature
                  review.
                </p>
              </div>
              <div className="mt-auto min-w-0 overflow-hidden rounded-xl border border-white/[0.08] bg-slate-900/50 px-3.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <p className="text-[11px] text-slate-500">Supervisor chat</p>
                <p className="mt-1 text-pretty text-[13px] italic leading-relaxed text-slate-500 md:text-sm">
                  Ask a focused question about this section…
                </p>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
