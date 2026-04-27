import Link from "next/link";

/** Inline brand mark + wordmark (ThesisAI-style split accent, Turbo-style icon). */
export default function ScholarFlowLogo() {
  return (
    <Link
      href="/"
      className="group flex min-w-0 shrink-0 items-center gap-2.5 rounded-full py-0.5 pr-1 outline-offset-4 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-500/60"
      aria-label="ScholarFlow home"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-teal-200/70 bg-gradient-to-br from-white to-teal-50/90 shadow-sm shadow-teal-900/5 dark:border-teal-800/50 dark:from-slate-800 dark:to-teal-950/50 dark:shadow-black/30"
        aria-hidden
      >
        <svg width="22" height="22" viewBox="0 0 32 32" fill="none" className="text-teal-600 dark:text-teal-400">
          <path
            d="M8 10h16M8 15h12M8 20h14"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.45"
          />
          <path
            d="M22 8c2.5 2.2 4 5.1 4 8.2 0 3.1-1.5 6-4 8.2"
            stroke="url(#sf-nav-mark-grad)"
            strokeWidth="2.25"
            strokeLinecap="round"
          />
          <defs>
            <linearGradient id="sf-nav-mark-grad" x1="22" y1="8" x2="26" y2="24" gradientUnits="userSpaceOnUse">
              <stop stopColor="#0d9488" />
              <stop offset="1" stopColor="#06b6d4" />
            </linearGradient>
          </defs>
        </svg>
      </span>
      <span className="flex min-w-0 items-baseline gap-1.5 sm:gap-2">
        <span className="font-sans text-[1.125rem] font-bold tracking-[-0.03em] text-[#0f2847] dark:text-slate-100 sm:text-[1.25rem]">
          Scholar
        </span>
        <span
          className="hidden h-[1.1em] w-px shrink-0 self-center bg-gradient-to-b from-teal-500 to-cyan-400 opacity-80 sm:block"
          aria-hidden
        />
        <span className="bg-gradient-to-r from-teal-600 via-teal-500 to-cyan-500 bg-clip-text font-sans text-[1.125rem] font-extrabold tracking-[-0.04em] text-transparent sm:text-[1.25rem]">
          Flow
        </span>
      </span>
    </Link>
  );
}
