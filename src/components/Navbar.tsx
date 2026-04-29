import Link from "next/link";
import { auth } from "@/auth";
import NavbarStickyChrome from "@/components/NavbarStickyChrome";
import ThesisPilotLogo from "@/components/ScholarFlowLogo";
import ThemeToggle from "@/components/ThemeToggle";

export default async function Navbar() {
  const session = await auth();
  const isLoggedIn = Boolean(session?.user);

  return (
    <NavbarStickyChrome>
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 rounded-full border border-[#D9E8FF] bg-white/70 px-5 py-2.5 shadow-[0_12px_40px_-16px_rgba(7,26,58,0.12),0_0_48px_-12px_rgba(23,107,255,0.12)] ring-1 ring-inset ring-white/40 backdrop-blur-xl dark:border-cyan-400/15 dark:bg-slate-950/50 dark:shadow-[0_20px_56px_-18px_rgba(0,0,0,0.7),0_0_56px_-14px_rgba(34,211,238,0.22),inset_0_1px_0_rgba(255,255,255,0.07)] dark:ring-cyan-300/12 dark:backdrop-blur-xl sm:gap-5 sm:px-7 sm:py-3 md:max-w-5xl md:gap-6 supports-[backdrop-filter]:bg-white/60 supports-[backdrop-filter]:dark:bg-slate-950/45">
        <ThesisPilotLogo />
        <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm md:gap-x-7 md:gap-y-2">
          <Link href="/pricing" className="text-[#071A3A]/75 transition hover:text-[#176BFF] dark:text-slate-300 dark:hover:text-white">
            Pricing
          </Link>
          <Link
            href={isLoggedIn ? "/settings" : "/auth/signin?callbackUrl=/settings"}
            className="text-[#071A3A]/75 transition hover:text-[#176BFF] dark:text-slate-300 dark:hover:text-white"
          >
            Settings
          </Link>
          {isLoggedIn ? (
            <Link
              href="/dashboard"
              className="rounded-full bg-gradient-to-r from-[#176BFF] to-[#2563EB] px-4 py-2 text-sm font-semibold text-white shadow-[0_0_24px_-6px_rgba(23,107,255,0.35)] transition hover:shadow-[0_0_32px_-4px_rgba(37,99,235,0.45)]"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/auth/signin" className="text-[#071A3A]/75 hover:text-[#176BFF] dark:text-slate-300 dark:hover:text-white">
                Sign in
              </Link>
              <Link
                href="/auth/signup"
                className="rounded-full bg-gradient-to-r from-[#176BFF] to-[#2563EB] px-4 py-2 text-sm font-semibold text-white shadow-[0_0_24px_-6px_rgba(23,107,255,0.35)] transition hover:shadow-[0_0_32px_-4px_rgba(37,99,235,0.45)]"
              >
                Sign up
              </Link>
            </>
          )}
          <ThemeToggle />
        </nav>
      </div>
    </NavbarStickyChrome>
  );
}
