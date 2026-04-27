"use client";

import Link from "next/link";
import { useState } from "react";

type Billing = "monthly" | "annual";

const PRO_MONTHLY = 19;
const PRO_ANNUAL_TOTAL = 180;

export default function LandingPricingSection() {
  const [billing, setBilling] = useState<Billing>("monthly");

  const monthlyYearTotal = PRO_MONTHLY * 12;

  return (
    <section className="relative rounded-2xl bg-white/90 px-5 py-8 shadow-sm ring-1 ring-cyan-200/30 dark:bg-slate-900/90 dark:ring-slate-600/40 md:rounded-3xl md:px-10 md:py-12">
      <h2 className="text-center text-3xl font-extrabold text-[#0f2847] dark:text-slate-100 md:text-4xl">Simple pricing</h2>
      <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-[#0c1e3c]/80 dark:text-slate-400">
        Start free to validate your workflow. Upgrade when you need more reviews and headroom across projects.
      </p>

      <div className="mx-auto mt-8 flex flex-col items-center gap-2">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0f2847]/55 dark:text-slate-500">
          Billing
        </p>
        <div
          className="inline-flex items-center gap-1 rounded-full border border-[#0f2847]/12 bg-[#0f2847]/5 p-1 pr-2 dark:border-slate-600/60 dark:bg-slate-800/80"
          role="group"
          aria-label="Choose monthly or annual billing for Pro"
        >
          <button
            type="button"
            onClick={() => setBilling("monthly")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              billing === "monthly"
                ? "bg-white text-[#0f2847] shadow-sm dark:bg-slate-700 dark:text-slate-100"
                : "text-[#0f2847]/65 hover:text-[#0f2847] dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBilling("annual")}
            className={`relative rounded-full px-4 py-2 text-sm font-semibold transition ${
              billing === "annual"
                ? "bg-white text-[#0f2847] shadow-sm dark:bg-slate-700 dark:text-slate-100"
                : "text-[#0f2847]/65 hover:text-[#0f2847] dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            Annual
            <span className="pointer-events-none absolute -right-0.5 -top-2 whitespace-nowrap rounded-full bg-gradient-to-r from-teal-600 to-cyan-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-sm">
              Save
            </span>
          </button>
        </div>
        {billing === "annual" ? (
          <p className="max-w-md text-center text-xs text-teal-800/90 dark:text-teal-300/90">
            Pro annual is <strong>$15/mo</strong> effective when billed <strong>${PRO_ANNUAL_TOTAL}/yr</strong>—about $
            {monthlyYearTotal - PRO_ANNUAL_TOTAL} less than twelve months at ${PRO_MONTHLY}/mo.
          </p>
        ) : (
          <p className="text-center text-xs text-[#0c1e3c]/55 dark:text-slate-500">Switch to annual to see the discounted Pro rate.</p>
        )}
      </div>

      <div className="mx-auto mt-8 grid max-w-4xl gap-5 md:grid-cols-2">
        <article className="rounded-2xl border border-[#0f2847]/10 p-6 shadow-sm dark:border-slate-600/50 dark:bg-slate-900/50">
          <h3 className="text-2xl font-light text-[#0f2847] dark:text-slate-100">Free</h3>
          <p className="mt-2 text-4xl font-bold text-teal-700 dark:text-teal-400">$0</p>
          <ul className="mt-4 space-y-2 text-sm text-[#0c1e3c]/85 dark:text-slate-300">
            <li>3 AI reviews per month</li>
            <li>1 active project</li>
            <li>Reference upload, outline, draft generation, writing studio</li>
            <li>Exports: PDF, print, TXT, Markdown, LaTeX</li>
          </ul>
          <Link
            href="/auth/signup"
            className="mt-6 inline-block rounded-full bg-gradient-to-r from-teal-600 to-cyan-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md"
          >
            Get started
          </Link>
        </article>

        <article className="rounded-2xl border-2 border-teal-500/50 bg-gradient-to-b from-teal-50/50 to-white p-6 shadow-md dark:border-teal-500/40 dark:from-teal-950/40 dark:to-slate-900">
          <h3 className="text-2xl font-light text-[#0f2847] dark:text-slate-100">Pro</h3>
          {billing === "monthly" ? (
            <>
              <p className="mt-2 text-4xl font-bold text-teal-700 dark:text-teal-400">
                ${PRO_MONTHLY}
                <span className="text-xl font-semibold text-teal-700/90 dark:text-teal-400/90">/mo</span>
              </p>
              <p className="mt-1 text-xs text-[#0c1e3c]/65 dark:text-slate-400">Billed every month. Cancel anytime.</p>
            </>
          ) : (
            <>
              <p className="mt-2 text-4xl font-bold text-teal-700 dark:text-teal-400">
                $15
                <span className="text-xl font-semibold text-teal-700/90 dark:text-teal-400/90">/mo</span>
              </p>
              <p className="mt-1 text-xs text-[#0c1e3c]/75 dark:text-slate-400">
                <strong className="text-[#0f2847] dark:text-slate-200">${PRO_ANNUAL_TOTAL}</strong> once per year (
                {Math.round(((monthlyYearTotal - PRO_ANNUAL_TOTAL) / monthlyYearTotal) * 100)}% off vs monthly)
              </p>
            </>
          )}
          <ul className="mt-4 space-y-2 text-sm text-[#0c1e3c]/85 dark:text-slate-300">
            <li>Higher monthly AI review limits</li>
            <li>Multiple projects</li>
            <li>Full methodology and structure review modes</li>
            <li>Supervisor chat + exports for serious revision cycles</li>
          </ul>
          <Link
            href="/pricing"
            className="mt-6 inline-block rounded-full border-2 border-teal-600 px-6 py-2.5 text-sm font-semibold text-teal-800 transition hover:bg-teal-50 dark:border-teal-500 dark:text-teal-300 dark:hover:bg-teal-950/50"
          >
            Compare on pricing page
          </Link>
        </article>
      </div>
    </section>
  );
}
