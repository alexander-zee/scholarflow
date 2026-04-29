"use client";

export type UpgradeBilling = "monthly" | "annual";

type UpgradeToProButtonProps = {
  billing: UpgradeBilling;
  className?: string;
  children?: React.ReactNode;
};

/**
 * Native form POST → API returns 303 redirect to Stripe Checkout.
 * Avoids fetch/CORS/Accept quirks that can prevent leaving the site.
 */
export default function UpgradeToProButton({ billing, className, children }: UpgradeToProButtonProps) {
  return (
    <form action="/api/stripe/create-checkout-session" method="POST" className="contents">
      <input type="hidden" name="billing" value={billing} />
      <button type="submit" className={className}>
        {children ?? "Upgrade to Pro"}
      </button>
    </form>
  );
}
