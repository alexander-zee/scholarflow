type LandingDemoVideoPlaceholderProps = {
  className?: string;
};

/**
 * Placeholder until a real product demo is embedded (e.g. `<video>` or hosted player).
 */
export default function LandingDemoVideoPlaceholder({ className = "" }: LandingDemoVideoPlaceholderProps) {
  return (
    <div
      className={`relative h-full min-h-[17rem] w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-950/35 shadow-lg shadow-black/30 backdrop-blur-xl sm:min-h-[20rem] md:min-h-[26rem] md:rounded-[1.5rem] lg:min-h-[30rem] supports-[backdrop-filter]:bg-slate-950/[0.28] ${className}`.trim()}
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 100%, rgba(56, 189, 248, 0.12), transparent 60%), radial-gradient(ellipse 50% 40% at 80% 20%, rgba(14, 165, 233, 0.08), transparent 50%)",
        }}
      />
      <div className="relative flex h-full min-h-0 flex-col items-center justify-center gap-4 px-6 py-12 text-center sm:py-14 md:py-16">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-sky-500/25 text-sky-200 md:h-24 md:w-24">
          <svg className="ml-1 h-9 w-9 md:h-11 md:w-11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7L8 5z" />
          </svg>
        </div>
        <div>
          <p className="text-base font-semibold text-slate-100 md:text-lg">Product demo</p>
          <p className="mt-2 max-w-sm text-sm leading-snug text-slate-400 md:text-base">
            Placeholder — drop in your walkthrough video when ready.
          </p>
        </div>
      </div>
    </div>
  );
}
