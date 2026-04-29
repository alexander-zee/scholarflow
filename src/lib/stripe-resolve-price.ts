import type Stripe from "stripe";

/**
 * Checkout `line_items` need a Price ID (`price_...`).
 * Accepts either `price_...` or a Product ID (`prod_...`) using the product's default price.
 */
export async function resolveStripePriceId(
  stripe: Stripe,
  raw: string | undefined | null,
): Promise<string | null> {
  const v = raw?.trim();
  if (!v) return null;
  if (v.startsWith("price_")) return v;
  if (v.startsWith("prod_")) {
    const product = await stripe.products.retrieve(v);
    const dp = product.default_price;
    if (!dp) return null;
    if (typeof dp === "string") return dp;
    if (typeof dp === "object" && dp && "id" in dp && typeof dp.id === "string") return dp.id;
    return null;
  }
  return null;
}
