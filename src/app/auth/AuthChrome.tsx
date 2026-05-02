"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThesisPilotLogo from "@/components/ScholarFlowLogo";
import ThemeToggle from "@/components/ThemeToggle";

const navLink =
  "rounded-full px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white";

export default function AuthChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const onSignIn = pathname === "/auth/signin";
  const onSignUp = pathname === "/auth/signup";

  return (
    <div
      className="fixed inset-0 z-[100] flex min-h-0 flex-col overflow-y-auto bg-[radial-gradient(1200px_800px_at_80%_20%,rgba(29,78,216,0.08),transparent_55%),linear-gradient(165deg,#f1f5f9_0%,#e8eef5_45%,#f8fafc_100%)] dark:bg-[radial-gradient(1000px_700px_at_85%_15%,rgba(59,130,246,0.12),transparent_50%),linear-gradient(165deg,#0f172a_0%,#111827_50%,#0b1220_100%)]"
      role="presentation"
    >
      <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/75 px-4 py-3 backdrop-blur-md dark:border-slate-700/70 dark:bg-slate-950/75 sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4">
          <ThesisPilotLogo />
          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1 sm:gap-2">
            <Link href="/pricing" className={navLink}>
              Pricing
            </Link>
            <Link
              href="/auth/signin"
              className={`hidden rounded-full px-3 py-1.5 text-sm font-semibold sm:inline-block ${
                onSignIn ? "text-[#1D4ED8] dark:text-blue-400" : "text-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white"
              }`}
            >
              Login
            </Link>
            <Link
              href="/auth/signup"
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                onSignUp
                  ? "bg-[#1D4ED8] text-white shadow-sm hover:bg-[#1e40af]"
                  : "border border-slate-200 bg-white text-slate-800 shadow-sm hover:border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500"
              }`}
            >
              Sign Up
            </Link>
            <label className="sr-only" htmlFor="auth-lang">
              Language
            </label>
            <select
              id="auth-lang"
              defaultValue="en"
              className="h-9 cursor-pointer rounded-full border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              aria-label="Language"
            >
              <option value="en">EN</option>
            </select>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8 sm:px-6 md:py-12">{children}</div>
    </div>
  );
}
