import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import UpgradeToProButton from "@/components/UpgradeToProButton";

const PAID_STATUSES = new Set(["active", "trialing", "past_due"]);

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/billing");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      subscriptionPlan: true,
      subscriptionStatus: true,
      stripeCustomerId: true,
    },
  });

  const status = (user?.subscriptionStatus || "free").toLowerCase();
  const canUsePortal =
    user?.subscriptionPlan === "pro" && PAID_STATUSES.has(status) && Boolean(user.stripeCustomerId);

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Billing</h1>
        <p className="mt-2 text-sm text-slate-600">
          {canUsePortal
            ? "Manage payment methods, invoices, and cancellation through the Stripe customer portal."
            : "Upgrade to Pro with secure Stripe Checkout. The billing portal is available once you have an active Pro subscription."}
        </p>
      </section>

      {canUsePortal ? (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Manage subscription</h2>
          <p className="mt-2 text-sm text-slate-600">Open the Stripe Billing Portal for your ThesisPilot Pro subscription.</p>
          <form action="/api/stripe/portal" method="POST" className="mt-4">
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Open Billing Portal
            </button>
          </form>
        </section>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Upgrade to Pro</h2>
          <p className="mt-2 text-sm text-slate-600">
            Start a Pro subscription in one step. You will be redirected to Stripe Checkout (not the billing portal).
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <UpgradeToProButton
              billing="monthly"
              className="rounded-lg bg-gradient-to-r from-cyan-500 to-teal-500 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-sm transition hover:brightness-105 disabled:opacity-70"
            >
              Upgrade to Pro
            </UpgradeToProButton>
            <Link
              href="/pricing"
              className="inline-flex items-center rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              View pricing
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
