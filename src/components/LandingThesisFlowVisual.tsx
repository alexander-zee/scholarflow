import LandingFeaturePanelShell from "@/components/LandingFeaturePanelShell";
import {
  landingFeaturePanelSection,
  landingFeaturePanelSubtitle,
  landingFeaturePanelTitle,
  landingFeaturePanelVisualGap,
} from "@/lib/landing-ui";

/**
 * Contained product-demo panel: references → AI → thesis + supervisor (Turbo-style card).
 */
export default function LandingThesisFlowVisual() {
  const inputs = [
    { label: "Research Paper", icon: "📄", rotate: "-rotate-[5deg]" },
    { label: "Assigned Paper", icon: "📑", rotate: "rotate-[4deg]" },
    { label: "References", icon: "📚", rotate: "-rotate-[3deg]" },
    { label: "Web Sources", icon: "🔗", rotate: "rotate-[4deg]" },
    { label: "PDF / Notes", icon: "📝", rotate: "-rotate-[4deg]" },
  ];

  const chapters = ["Introduction", "Literature Review", "Methodology", "Results", "Appendices"];

  return (
    <section className={landingFeaturePanelSection}>
      <LandingFeaturePanelShell>
        <div className="text-left">
          <h2 className={landingFeaturePanelTitle}>Generate a full academic thesis from your sources.</h2>
          <p className={landingFeaturePanelSubtitle}>
            Upload assigned papers, references, PDFs, notes, and web sources. ThesisPilot builds a complete thesis draft with structured chapters, citations, equations, tables, figures, and appendices.
          </p>
        </div>

        <div className={`${landingFeaturePanelVisualGap} flex min-h-[180px] flex-col items-center justify-center gap-5 lg:hidden`}>
          <InputCluster inputs={inputs} />
          <div
            className="h-10 w-px shrink-0 rounded-full bg-gradient-to-b from-cyan-400/75 via-sky-400/50 to-teal-400/35 shadow-[0_0_12px_rgba(34,211,238,0.35)]"
            aria-hidden
          />
          <AiNode />
          <div
            className="h-10 w-px shrink-0 rounded-full bg-gradient-to-b from-teal-400/55 via-cyan-400/65 to-sky-400/35 shadow-[0_0_12px_rgba(34,211,238,0.28)]"
            aria-hidden
          />
          <OutputPair chapters={chapters} />
        </div>

        <div
          className={`${landingFeaturePanelVisualGap} hidden min-h-[180px] min-w-0 grid-cols-[minmax(0,1fr)_minmax(2.5rem,3.5rem)_auto_minmax(2.5rem,3.5rem)_minmax(0,1.05fr)] items-center gap-x-1 gap-y-4 lg:grid`}
        >
          <div className="flex min-w-0 justify-center overflow-hidden">
            <InputCluster inputs={inputs} />
          </div>

          <div className="relative flex min-w-0 items-center justify-center overflow-hidden px-0.5" aria-hidden>
            <div className="h-0.5 w-full min-w-0 rounded-full bg-gradient-to-r from-cyan-400/80 via-sky-400/45 to-teal-500/25 shadow-[0_0_14px_rgba(34,211,238,0.25)]" />
          </div>

          <div className="flex shrink-0 justify-center px-1">
            <AiNode />
          </div>

          <div className="relative flex min-w-0 items-center justify-center overflow-hidden px-0.5" aria-hidden>
            <div className="h-0.5 w-full min-w-0 rounded-full bg-gradient-to-r from-teal-500/25 via-sky-400/50 to-cyan-400/80 shadow-[0_0_14px_rgba(34,211,238,0.22)]" />
          </div>

          <div className="min-w-0 overflow-hidden">
            <OutputPair chapters={chapters} />
          </div>
        </div>
      </LandingFeaturePanelShell>
    </section>
  );
}

const clusterPositions5 = [
  "left-0 top-0",
  "left-[34%] top-0",
  "left-[62%] top-0.5",
  "left-[10%] top-[52%]",
  "left-[48%] top-[56%]",
] as const;

function InputCluster({
  inputs,
}: {
  inputs: { label: string; icon: string; rotate: string }[];
}) {
  return (
    <div className="relative mx-auto h-[128px] w-[168px] shrink-0 sm:h-[122px] sm:w-[158px]">
      {inputs.map((item, i) => (
        <div
          key={item.label}
          className={`absolute flex w-[68px] flex-col items-center gap-0.5 rounded-lg border border-cyan-400/18 bg-slate-900/70 px-1.5 py-1 shadow-[0_0_12px_-4px_rgba(34,211,238,0.12),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm ${item.rotate} ${clusterPositions5[i] ?? "left-0 top-0"}`}
          style={{ zIndex: 10 + i }}
        >
          <span className="text-sm leading-none" aria-hidden>
            {item.icon}
          </span>
          <span className="text-center text-[7px] font-semibold leading-tight text-slate-200">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function AiNode() {
  return (
    <div className="relative w-max shrink-0">
      <div
        className="absolute inset-[-4px] rounded-full bg-gradient-to-r from-sky-500 via-cyan-400 to-teal-400 opacity-65 blur-md animate-pulse"
        aria-hidden
      />
      <div className="relative rounded-full bg-gradient-to-r from-sky-500/90 via-cyan-500/88 to-teal-500/85 p-[1.5px] shadow-[0_0_28px_-4px_rgba(34,211,238,0.38),0_0_24px_-2px_rgba(20,184,166,0.22)]">
        <div className="rounded-full bg-slate-950/95 px-3.5 py-2 backdrop-blur-sm md:px-4 md:py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-cyan-300" aria-hidden>
              ✦
            </span>
            <span className="text-[11px] font-semibold tracking-tight text-white md:text-xs">AI Generating Thesis…</span>
          </div>
          <p className="mt-0.5 text-center text-[9px] font-medium text-cyan-100/75 md:text-[10px]">Analyzing • Structuring • Citing • Writing</p>
        </div>
      </div>
    </div>
  );
}

function OutputPair({ chapters }: { chapters: string[] }) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-2.5">
      <div className="rounded-xl border border-cyan-400/18 bg-slate-900/55 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-md md:p-3">
        <div className="flex items-center justify-between gap-1 border-b border-white/[0.06] pb-2">
          <h3 className="text-[11px] font-bold text-white">Your Thesis</h3>
          <span className="rounded-full bg-emerald-500/12 px-1.5 py-px text-[8px] font-semibold text-emerald-300/90">Auto-saved</span>
        </div>
        <ul className="mt-2 space-y-2">
          {chapters.map((c) => (
            <li key={c}>
              <p className="text-[10px] font-semibold text-slate-200">{c}</p>
              <div className="mt-1 space-y-1">
                <div className="h-1 w-[92%] rounded-full bg-slate-700/45" />
                <div className="h-1 w-[70%] rounded-full bg-slate-700/30" />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-cyan-400/18 bg-slate-900/55 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-md md:p-3">
        <div className="flex items-center justify-between gap-1 border-b border-white/[0.06] pb-2">
          <h3 className="text-[11px] font-bold text-white">AI Supervisor</h3>
          <span className="flex items-center gap-1 text-[8px] font-semibold text-emerald-300/90">
            <span className="h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
            Reviewing
          </span>
        </div>
        <div className="mt-2 space-y-1.5">
          <div className="max-w-[94%] rounded-lg rounded-tl-sm border border-cyan-400/12 bg-cyan-950/30 px-2 py-1.5">
            <span className="text-[8px] text-cyan-300/90">✦</span>
            <p className="mt-0.5 text-[9px] leading-snug text-slate-300">Narrow this claim to match the cited evidence.</p>
          </div>
          <div className="ml-auto max-w-[88%] rounded-lg rounded-tr-sm border border-white/10 bg-slate-800/45 px-2 py-1.5">
            <p className="text-[9px] leading-snug text-slate-400">Add one primary citation before expanding this argument.</p>
          </div>
          <div className="max-w-[90%] rounded-lg rounded-tl-sm border border-cyan-400/12 bg-cyan-950/30 px-2 py-1.5">
            <p className="text-[9px] leading-snug text-slate-300">Turn this into a testable hypothesis.</p>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-slate-950/50 px-2 py-1.5">
          <span className="min-w-0 flex-1 truncate text-[9px] text-slate-500">Ask your AI supervisor…</span>
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-sky-600 text-white shadow-[0_0_10px_rgba(34,211,238,0.35)]">
            <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
              <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}
