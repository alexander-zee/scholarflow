import Link from "next/link";

type SiteMarketingFooterProps = {
  className?: string;
  /** Tighter vertical padding for dense app views (e.g. writing studio). */
  compact?: boolean;
  /**
   * `marketing` — open / Turbo-style footer on the same dark canvas as the landing page (no navy slab).
   * `minimal` — compact translucent bar for app shells (e.g. writing studio).
   */
  surface?: "marketing" | "minimal";
};

const linkCol =
  "text-sm text-slate-600 transition hover:text-slate-950 dark:text-slate-400 dark:hover:text-white";

export default function SiteMarketingFooter({
  className = "",
  compact = false,
  surface = "marketing",
}: SiteMarketingFooterProps) {
  const py = compact ? "py-8 md:py-10" : "pt-16 pb-12 md:pt-20 md:pb-16 lg:pt-24 lg:pb-20";
  const navPb = compact ? "pb-6" : "pb-8";
  const bodyMt = compact ? "mt-8 md:mt-10" : "mt-12 md:mt-14 lg:mt-16";

  const shellClass =
    surface === "minimal"
      ? "border-t border-white/10 bg-slate-950/25 text-slate-200 backdrop-blur-xl supports-[backdrop-filter]:bg-slate-950/[0.18]"
      : "border-t border-slate-200/80 bg-transparent text-slate-600 dark:border-white/[0.07] dark:text-slate-300";

  if (surface === "marketing") {
    return (
      <footer className={`${shellClass} ${py} relative overflow-hidden ${className}`.trim()}>
        <div className="relative z-10 mx-auto w-full max-w-[1180px] px-4 md:px-6">
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-10 lg:gap-y-14">
            <div className="lg:col-span-5">
              <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white md:text-3xl">ThesisPilot</p>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-600 dark:text-slate-400 md:text-base">
                Thesis workspace: source-grounded generation, citations, figures, equations, review, and exports — you keep authorship.
              </p>
              <Link
                href="/auth/signup"
                className="mt-6 inline-flex rounded-full bg-gradient-to-r from-sky-600 to-cyan-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-sky-950/30 transition hover:brightness-110"
              >
                Get started — it&apos;s free
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:col-span-7 lg:justify-items-stretch">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Product</p>
                <ul className="mt-4 space-y-2.5">
                  <li>
                    <Link href="/pricing" className={linkCol}>
                      Pricing
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Legal</p>
                <ul className="mt-4 space-y-2.5">
                  <li>
                    <Link href="/terms" className={linkCol}>
                      Terms
                    </Link>
                  </li>
                  <li>
                    <Link href="/privacy" className={linkCol}>
                      Privacy
                    </Link>
                  </li>
                </ul>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Account</p>
                <ul className="mt-4 space-y-2.5">
                  <li>
                    <Link href="/settings" className={linkCol}>
                      Settings
                    </Link>
                  </li>
                  <li>
                    <Link href="/auth/signin" className={linkCol}>
                      Sign in
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-14 border-t border-slate-200/80 pt-8 text-center text-xs text-slate-500 dark:border-white/[0.08] md:text-sm">
            © {new Date().getFullYear()} ThesisPilot
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className={`${shellClass} ${py} ${className}`.trim()}>
      <div className="relative z-10 mx-auto w-full max-w-[2200px] px-5 sm:px-8 md:px-12 lg:px-16">
        <div
          className={`flex flex-wrap items-center justify-between gap-x-10 gap-y-4 border-b border-slate-200/80 text-sm font-medium uppercase tracking-[0.12em] text-slate-600 sm:justify-evenly sm:gap-x-6 md:justify-between md:tracking-wide dark:border-white/10 dark:text-slate-300 ${navPb}`}
        >
          <Link href="/pricing" className="transition hover:text-slate-950 dark:hover:text-white">
            Pricing
          </Link>
          <Link href="/terms" className="transition hover:text-slate-950 dark:hover:text-white">
            Terms
          </Link>
          <Link href="/privacy" className="transition hover:text-slate-950 dark:hover:text-white">
            Privacy
          </Link>
          <Link href="/settings" className="transition hover:text-slate-950 dark:hover:text-white">
            Settings
          </Link>
        </div>
        <div className={`flex flex-col md:flex-row md:items-end md:justify-between ${compact ? "gap-5" : "gap-8"} ${bodyMt}`}>
          <div className="max-w-3xl">
            <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white md:text-3xl">ThesisPilot</p>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400 md:text-base md:leading-relaxed">
              Thesis workspace: source-grounded generation, citations, figures, equations, review, and exports — you keep authorship and accountability for every submission.
            </p>
          </div>
          <p className="shrink-0 text-xs text-slate-500 md:text-right md:text-sm">
            © {new Date().getFullYear()} ThesisPilot
          </p>
        </div>
      </div>
    </footer>
  );
}
