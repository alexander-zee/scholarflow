import Link from "next/link";

/** Brand mark from supplied asset + ThesisPilot wordmark. */
export default function ThesisPilotLogo() {
  return (
    <Link
      href="/"
      className="group flex min-w-0 shrink-0 items-center gap-2.5 rounded-full py-0.5 pr-1 outline-offset-4 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#176BFF]/50"
      aria-label="ThesisPilot home"
    >
      <img
        src="/thesispilot-logo-icon.png"
        alt="ThesisPilot logo"
        className="h-9 w-9 shrink-0 object-contain"
        width={36}
        height={36}
      />
      <span className="flex min-w-0 items-baseline gap-1.5 sm:gap-2">
        <span className="font-sans text-[1.125rem] font-bold tracking-[-0.03em] text-[#071A3A] dark:text-slate-100 sm:text-[1.25rem]">
          Thesis
        </span>
        <span
          className="hidden h-[1.1em] w-px shrink-0 self-center bg-[#176BFF]/40 opacity-90 sm:block"
          aria-hidden
        />
        <span className="font-sans text-[1.125rem] font-extrabold tracking-[-0.04em] text-[#176BFF] sm:text-[1.25rem]">
          Pilot
        </span>
      </span>
    </Link>
  );
}
