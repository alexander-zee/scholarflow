import LandingAcademicBackdrop from "@/components/LandingAcademicBackdrop";
import PricingComparison from "@/components/PricingComparison";
import { landingMax } from "@/lib/landing-ui";

function checkoutErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  const messages: Record<string, string> = {
    missing_price_id:
      "Stripe is not configured yet: set STRIPE_PRO_PRICE_ID (Price ID, price_…) or STRIPE_PRO_MONTHLY_PRODUCT_ID (Product ID, prod_…) in Vercel → Environment Variables, then redeploy.",
    product_no_default_price:
      "Stripe product has no default price: open the product in Stripe → set a default price on the product, or set STRIPE_PRO_PRICE_ID to the monthly price_… ID directly.",
    already_subscribed: "You already have an active Pro subscription. Use Billing to manage your plan.",
    stripe_failed: "Stripe could not start checkout. Check server logs and your Stripe keys.",
    no_checkout_url: "Stripe returned no checkout URL. Check your Stripe account and price ID.",
    invalid_body: "Invalid checkout request. Try again from the pricing page.",
    no_user: "Account not found. Sign out and sign in again, then try upgrading.",
  };
  return messages[code] ?? `Checkout could not start (${code}).`;
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout_error?: string; checkout?: string }>;
}) {
  const sp = await searchParams;
  const errMsg = checkoutErrorMessage(sp.checkout_error);
  const cancelled = sp.checkout === "cancelled";

  return (
    <div className="relative min-h-[calc(100dvh-4.5rem)] overflow-hidden bg-slate-100 dark:bg-[#030712]">
      <LandingAcademicBackdrop />
      <main className={`relative z-10 ${landingMax} pb-24 pt-10 md:pb-28 md:pt-14`}>
        {errMsg ? (
          <div
            role="alert"
            className="mb-8 rounded-xl border border-amber-300/80 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100"
          >
            {errMsg}
          </div>
        ) : null}
        {cancelled && !errMsg ? (
          <div className="mb-8 rounded-xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-700 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200">
            Checkout was cancelled. You can upgrade again whenever you are ready.
          </div>
        ) : null}
        <PricingComparison titleLevel="h1" />
      </main>
    </div>
  );
}
