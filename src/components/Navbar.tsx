import Link from "next/link";
import { auth } from "@/auth";
import ScholarFlowLogo from "@/components/ScholarFlowLogo";
import ThemeToggle from "@/components/ThemeToggle";

export default async function Navbar() {
  const session = await auth();
  const isLoggedIn = Boolean(session?.user);

  return (
    <header className="sticky top-2 z-50 bg-gradient-to-b from-white/92 via-white/78 to-transparent px-3 pb-2 pt-3 dark:from-slate-950/92 dark:via-slate-950/70 dark:to-transparent md:px-4">
      <div className="mx-auto flex w-full max-w-[1780px] items-center justify-between gap-3 rounded-full border border-cyan-300/55 bg-white/92 px-4 py-2 shadow-lg shadow-cyan-900/15 backdrop-blur-md dark:border-slate-500/70 dark:bg-slate-900/92 dark:shadow-black/30 sm:px-6 sm:py-2.5">
        <ScholarFlowLogo />
        <nav className="flex items-center gap-4 text-sm md:gap-5">
          <Link href="/pricing" className="text-[#0c1e3c]/80 transition hover:text-[#0f2847] dark:text-slate-300 dark:hover:text-white">
            Pricing
          </Link>
          <Link href="/academic-integrity" className="text-[#0c1e3c]/80 hover:text-[#0f2847] dark:text-slate-300 dark:hover:text-white">
            Academic Integrity
          </Link>
          {isLoggedIn ? (
            <Link
              href="/dashboard"
              className="rounded-full bg-gradient-to-r from-teal-600 to-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-teal-900/15"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/auth/signin" className="text-[#0c1e3c]/80 hover:text-[#0f2847] dark:text-slate-300 dark:hover:text-white">
                Sign in
              </Link>
              <Link
                href="/auth/signup"
                className="rounded-full bg-gradient-to-r from-teal-600 to-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-teal-900/15"
              >
                Sign up
              </Link>
            </>
          )}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
