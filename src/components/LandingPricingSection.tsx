"use client";

import Link from "next/link";
import PricingComparison from "@/components/PricingComparison";

type LandingPricingSectionProps = {
  variant?: "light" | "dark";
};

/**
 * Landing pricing — light variant is a teaser; dark variant is the full comparison (shared with /pricing).
 */
export default function LandingPricingSection({ variant = "light" }: LandingPricingSectionProps) {
  if (variant !== "dark") {
    return (
      <section className="relative py-16">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">Simple pricing</h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-600">
            Start free. Upgrade when you need more AI reviews and project headroom.
          </p>
          <div className="mt-8">
            <Link href="/pricing" className="text-sm font-semibold text-cyan-700 underline-offset-4 hover:underline">
              View full pricing →
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="relative w-full border-t border-slate-200/80 bg-transparent py-28 dark:border-white/[0.06]">
      <div className="mx-auto max-w-6xl px-6">
        <PricingComparison proCtaHref="/pricing" titleLevel="h2" />
      </div>
    </section>
  );
}
