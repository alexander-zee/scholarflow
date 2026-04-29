/** Consistent horizontal rhythm — matches large feature panels (max-w-6xl) for aligned edges. */
export const landingMax = "mx-auto w-full max-w-6xl px-4 md:px-6";

/** Paired home feature panels (thesis pipeline + full thesis) — outer card chrome (use with sf-landing-panel-depth + shell). */
export const landingFeaturePanelCard =
  "w-full max-w-none rounded-3xl border border-[#D9E8FF] bg-white/95 px-6 py-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.98),0_20px_56px_-34px_rgba(7,26,58,0.14)] backdrop-blur-xl sm:px-7 sm:py-8 md:px-8 md:py-8 dark:border-cyan-400/15 dark:bg-slate-950/60 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_20px_80px_-24px_rgba(0,0,0,0.35),0_30px_120px_-48px_rgba(14,165,233,0.08),0_24px_64px_-28px_rgba(0,0,0,0.5),0_0_40px_-14px_rgba(34,211,238,0.1)]";

/** Title row — use in both feature panels. */
export const landingFeaturePanelTitle =
  "text-2xl font-bold tracking-tight text-[#071A3A] dark:text-white md:text-3xl md:leading-snug";

/** Subtitle row — use in both feature panels. */
export const landingFeaturePanelSubtitle =
  "mt-3 max-w-2xl text-sm leading-relaxed text-[#52627A] dark:text-slate-400/90 md:text-base md:leading-relaxed";

/** Space between title block and visual. */
export const landingFeaturePanelVisualGap = "mt-6";

/** Outer section wrapper — width only; horizontal padding comes from parent `landingMax` grid. */
export const landingFeaturePanelSection = "relative w-full min-w-0";

/** Section title — calm academic hierarchy. */
export const landingH2 =
  "text-3xl font-bold tracking-tight text-[#071A3A] dark:text-white md:text-4xl lg:text-[2.75rem] lg:leading-tight";

/** Section lead — readable, slightly muted. */
export const landingLead =
  "mt-4 max-w-3xl text-base font-normal leading-[1.7] text-[#52627A] dark:text-slate-400 md:text-lg md:leading-[1.75]";

/** Primary CTA — ThesisPilot blue. */
export const landingPrimaryCta =
  "sf-landing-primary-cta group inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#176BFF] to-[#2563EB] px-8 py-4 text-base font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.34),0_10px_28px_-8px_rgba(23,107,255,0.45)] transition duration-300 hover:brightness-110 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.42),0_14px_30px_-8px_rgba(23,107,255,0.55)] active:scale-[0.99]";

/** Secondary CTA — light outline. */
export const landingSecondaryCta =
  "inline-flex items-center justify-center rounded-full border border-[#D9E8FF] bg-white px-8 py-4 text-base font-semibold text-[#071A3A] shadow-[0_10px_26px_-16px_rgba(7,26,58,0.24)] transition duration-300 hover:border-[#2563EB]/30 hover:text-[#176BFF] hover:shadow-[0_12px_30px_-16px_rgba(37,99,235,0.28)] active:scale-[0.99]";

/**
 * Glass feature surface — top light line + soft cyan hover aura.
 * Use on cards that benefit from depth (not on tiny chips).
 */
export const landingGlassCard =
  "sf-landing-glass-card-depth rounded-2xl border border-[#D9E8FF] bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.98),0_18px_42px_-28px_rgba(7,26,58,0.18)] backdrop-blur-md transition duration-300 ease-out hover:-translate-y-1 hover:border-[#2563EB]/35 hover:shadow-[0_20px_46px_-24px_rgba(37,99,235,0.24)] md:rounded-3xl";

/** Same glass without hover motion (nested panels, previews). */
export const landingGlassPanel =
  "rounded-2xl border border-[#D9E8FF] bg-gradient-to-b from-white to-[#F5FAFF] shadow-[inset_0_1px_0_rgba(255,255,255,0.98),0_16px_40px_-26px_rgba(7,26,58,0.16)] backdrop-blur-xl md:rounded-3xl";
