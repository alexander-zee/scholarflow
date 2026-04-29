import type { CSSProperties } from "react";

/**
 * Full-viewport marketing backdrop: subtle grid + soft gradients (no decorative imagery).
 * Reads closer to research / editorial UI than consumer “liquid glass” blobs.
 */
const lightGrid: CSSProperties = {
  backgroundImage: `
    linear-gradient(to right, rgb(100 116 139 / 0.085) 1px, transparent 1px),
    linear-gradient(to bottom, rgb(100 116 139 / 0.085) 1px, transparent 1px)
  `,
  backgroundSize: "52px 52px",
};

const darkGrid: CSSProperties = {
  backgroundImage: `
    linear-gradient(to right, rgb(148 163 184 / 0.04) 1px, transparent 1px),
    linear-gradient(to bottom, rgb(148 163 184 / 0.04) 1px, transparent 1px)
  `,
  backgroundSize: "72px 72px",
};

export default function LandingAcademicBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      {/* Light — cool paper + registration grid */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-18%,rgb(255_255_255)_0%,rgb(248_250_252)_38%,rgb(226_232_240)_100%)] dark:hidden" />
      <div className="absolute inset-0 dark:hidden" style={lightGrid} />
      <div className="absolute inset-0 bg-gradient-to-b from-white/70 via-transparent to-slate-200/35 dark:hidden" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-400/35 to-transparent dark:hidden" />

      {/* Dark — same vocabulary, restrained cyan (structure, not ornament) */}
      <div className="absolute inset-0 hidden bg-[#030712] dark:block" />
      <div className="absolute inset-0 hidden bg-gradient-to-b from-slate-900 via-[#0a101c] to-[#030712] dark:block" />
      <div className="absolute inset-0 hidden dark:block" style={darkGrid} />
      <div className="absolute inset-0 hidden bg-[radial-gradient(ellipse_95%_50%_at_50%_0%,rgb(34_211_238/0.05)_0%,transparent_55%)] dark:block" />
      <div className="absolute inset-0 hidden bg-gradient-to-b from-transparent via-transparent to-slate-950 dark:block" />
      <div className="absolute inset-x-0 top-0 hidden h-px bg-gradient-to-r from-transparent via-slate-400/12 to-transparent dark:block" />
    </div>
  );
}
