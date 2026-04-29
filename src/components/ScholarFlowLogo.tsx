import Link from "next/link";

export default function ThesisPilotLogo() {
  return (
    <Link
      href="/"
      className="group flex min-w-0 shrink-0 items-center rounded-full py-0.5 pr-1 outline-offset-4 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#176BFF]/50"
      aria-label="ThesisPilot home"
    >
      <span className="inline-flex translate-y-[0.5px] items-baseline whitespace-nowrap font-semibold leading-none tracking-[-0.35px]">
        <span className="text-[20px] text-[#0B1A2B] sm:text-[22px]">Thesis</span>
        <span className="text-[20px] text-[#1D4ED8] sm:text-[22px]">Pilot</span>
      </span>
    </Link>
  );
}
