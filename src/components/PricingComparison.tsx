"use client";

import Link from "next/link";
import { type ReactNode, useState } from "react";
import UpgradeToProButton from "@/components/UpgradeToProButton";
import { Info } from "lucide-react";
import {
  FEATURE_LABELS,
  FREE_VALUES,
  PRO_ANNUAL_TOTAL,
  PRO_MONTHLY,
  PRO_VALUES,
} from "@/lib/pricing-comparison-data";

type Billing = "monthly" | "annual";

type PricingComparisonProps = {
  /** Semantic level for the main title (home uses h2 inside page; pricing page uses h1). */
  titleLevel?: "h1" | "h2";
  className?: string;
};

function PriceBand({
  plan,
  children,
  note,
}: {
  plan: string;
  children: ReactNode;
  note: string;
}) {
  return (
    <div className="mb-6 flex min-h-[168px] flex-col rounded-2xl border border-slate-200/80 bg-white/55 p-6 backdrop-blur-xl dark:border-white/[0.08] dark:bg-slate-950/35">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">{plan}</p>
      <div className="mt-2 flex flex-1 flex-col justify-center">{children}</div>
      <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-500">{note}</p>
    </div>
  );
}

function ComparisonRows({ values }: { values: readonly string[] }) {
  return (
    <>
      <div className="flex flex-col lg:hidden">
        {FEATURE_LABELS.map((label, i) => (
          <div
            key={`m-${label}`}
            className="flex min-h-[3.5rem] items-center justify-between gap-3 border-b border-slate-200/70 py-2 text-sm last:border-b-0 dark:border-white/[0.06]"
          >
            <span className="max-w-[45%] text-left text-slate-600 dark:text-slate-400">{label}</span>
            <span className="max-w-[52%] text-right text-slate-800 dark:text-slate-200">{values[i]}</span>
          </div>
        ))}
      </div>
      <div className="hidden flex-col lg:flex">
        {values.map((value, idx) => (
          <div
            key={`d-${idx}`}
            className="flex h-14 items-center border-b border-slate-200/70 text-left text-sm text-slate-800 last:border-b-0 dark:border-white/[0.06] dark:text-slate-200"
          >
            {value}
          </div>
        ))}
      </div>
    </>
  );
}

function LabelColumn() {
  return (
    <div className="hidden flex-col lg:flex">
      <div className="mb-6 min-h-[168px]" aria-hidden />
      {FEATURE_LABELS.map((label) => (
        <div
          key={label}
          className="flex h-14 items-center border-b border-slate-200/70 text-left text-sm text-slate-600 last:border-b-0 dark:border-white/[0.06] dark:text-slate-400"
        >
          {label}
        </div>
      ))}
    </div>
  );
}

export default function PricingComparison({ titleLevel = "h2", className = "" }: PricingComparisonProps) {
  const [billing, setBilling] = useState<Billing>("monthly");
  const monthlyYearTotal = PRO_MONTHLY * 12;
  const TitleTag = titleLevel;

  return (
    <div className={className}>
      <TitleTag className="text-center text-4xl font-semibold tracking-tight text-slate-950 dark:text-white md:text-5xl">
        Simple pricing
      </TitleTag>
      <p className="mx-auto mt-4 max-w-2xl text-center text-lg leading-relaxed text-slate-600 dark:text-slate-400">
        Start free. Upgrade when you need more AI supervisor reviews, exports, and project headroom.
      </p>

      <div className="mx-auto mt-10 flex flex-col items-center gap-3">
        <div className="flex flex-wrap items-center justify-center gap-3 text-xl font-medium text-slate-950 dark:text-white">
          <span className="inline-flex items-center gap-1.5">
            Monthly
            <Info className="h-4 w-4 text-slate-500 dark:text-slate-400" aria-hidden />
          </span>
          <button
            type="button"
            role="switch"
            aria-label="Toggle annual billing"
            aria-checked={billing === "annual"}
            onClick={() => setBilling((current) => (current === "monthly" ? "annual" : "monthly"))}
            className="relative inline-flex h-9 w-16 shrink-0 items-center rounded-full border border-cyan-500/30 bg-white/80 p-1 transition-colors dark:border-cyan-400/20 dark:bg-slate-900/50"
          >
            <span
              className={`inline-block h-7 w-7 rounded-full bg-cyan-400 shadow-sm transition-transform ${
                billing === "annual" ? "translate-x-7" : "translate-x-0"
              }`}
            />
          </button>
          <span className="inline-flex items-center gap-1.5">
            Annual
            <Info className="h-4 w-4 text-slate-500 dark:text-slate-400" aria-hidden />
          </span>
        </div>
        {billing === "annual" ? (
          <p className="max-w-md text-center text-xs text-sky-800 dark:text-sky-300/95">
            Pro annual is <strong className="text-slate-900 dark:text-slate-100">$15/mo</strong> effective when billed{" "}
            <strong className="text-slate-900 dark:text-slate-100">${PRO_ANNUAL_TOTAL}/yr</strong> — about $
            {monthlyYearTotal - PRO_ANNUAL_TOTAL} less than twelve months at ${PRO_MONTHLY}/mo.
          </p>
        ) : (
          <p className="text-center text-xs text-slate-600 dark:text-slate-500">
            Switch to annual to see the discounted Pro rate.
          </p>
        )}
      </div>

      <div className="mt-14 grid grid-cols-1 items-stretch gap-6 lg:grid-cols-[220px_1fr_1fr]">
        <LabelColumn />

        <article className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-200/90 bg-white/65 p-6 backdrop-blur-xl dark:border-white/[0.10] dark:bg-slate-900/45 lg:p-8">
          <PriceBand plan="FREE" note="Start validating your thesis workflow.">
            <p className="text-5xl font-semibold leading-none tracking-tight text-slate-950 drop-shadow-sm dark:text-white dark:drop-shadow-[0_0_18px_rgba(34,211,238,0.12)]">
              <span className="text-cyan-600 dark:text-cyan-300">$</span>0
            </p>
          </PriceBand>
          <div className="flex min-h-0 flex-1 flex-col">
            <ComparisonRows values={FREE_VALUES} />
          </div>
          <Link
            href="/auth/signup"
            className="mt-8 block w-full rounded-full bg-cyan-500 py-3 text-center text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 lg:mt-auto"
          >
            Get started
          </Link>
        </article>

        <article className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-cyan-500/35 bg-white/70 p-6 pb-8 pt-12 shadow-[0_12px_48px_-24px_rgba(14,165,233,0.15)] backdrop-blur-xl dark:border-cyan-400/35 dark:bg-slate-900/45 dark:shadow-[0_0_70px_rgba(34,211,238,0.12)] lg:p-8 lg:pt-10">
          <span className="absolute right-5 top-5 z-10 rounded-full border border-cyan-500/45 bg-cyan-100/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan-900 dark:border-cyan-400/40 dark:bg-cyan-500/15 dark:text-cyan-200">
            Recommended
          </span>
          <PriceBand
            plan="PRO"
            note={
              billing === "monthly" ? "Billed monthly. Cancel anytime." : `Billed $${PRO_ANNUAL_TOTAL}/yr. Cancel anytime.`
            }
          >
            {billing === "monthly" ? (
              <p className="text-5xl font-semibold leading-none tracking-tight text-slate-950 drop-shadow-sm dark:text-white dark:drop-shadow-[0_0_18px_rgba(34,211,238,0.15)]">
                $<span className="text-slate-950 dark:text-white">{PRO_MONTHLY}</span>
                <span className="text-2xl font-semibold text-cyan-700 md:text-3xl dark:text-cyan-300">/mo</span>
              </p>
            ) : (
              <p className="text-5xl font-semibold leading-none tracking-tight text-slate-950 drop-shadow-sm dark:text-white dark:drop-shadow-[0_0_18px_rgba(34,211,238,0.15)]">
                $<span className="text-slate-950 dark:text-white">15</span>
                <span className="text-2xl font-semibold text-cyan-700 md:text-3xl dark:text-cyan-300">/mo</span>
              </p>
            )}
          </PriceBand>
          <div className="flex min-h-0 flex-1 flex-col">
            <ComparisonRows values={PRO_VALUES} />
          </div>
          <UpgradeToProButton
            billing={billing}
            className="mt-8 block w-full rounded-full bg-gradient-to-r from-cyan-400 to-teal-300 py-3 text-center text-sm font-semibold text-slate-950 shadow-[0_0_30px_rgba(34,211,238,0.25)] transition hover:brightness-110 disabled:opacity-70 lg:mt-auto"
          >
            Upgrade to Pro
          </UpgradeToProButton>
        </article>
      </div>
    </div>
  );
}
