import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { resolveAppOrigin } from "@/lib/stripe-app-origin";
import { resolveStripePriceId } from "@/lib/stripe-resolve-price";
import { z } from "zod";

const bodySchema = z.object({
  billing: z.enum(["monthly", "annual"]).optional().default("monthly"),
});

const ACTIVE_SUB_STATUSES = ["active", "trialing", "past_due"] as const;

async function parseBilling(request: Request): Promise<{ billing: "monthly" | "annual"; ok: true } | { ok: false }> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return { ok: false };
    return { ok: true, billing: parsed.data.billing };
  }
  const fd = await request.formData().catch(() => null);
  if (!fd) return { ok: false };
  const raw = fd.get("billing");
  if (raw === "annual" || raw === "monthly") return { ok: true, billing: raw };
  return { ok: true, billing: "monthly" };
}

export async function POST(request: Request) {
  const origin = await resolveAppOrigin(request);

  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    const signIn = new URL("/auth/signin", origin);
    signIn.searchParams.set("callbackUrl", "/pricing");
    return NextResponse.redirect(signIn, 303);
  }

  const parsedBilling = await parseBilling(request);
  if (!parsedBilling.ok) {
    return NextResponse.redirect(new URL("/pricing?checkout_error=invalid_body", origin), 303);
  }
  const { billing } = parsedBilling;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      stripeCustomerId: true,
    },
  });
  if (!user) {
    return NextResponse.redirect(new URL("/pricing?checkout_error=no_user", origin), 303);
  }

  const activeSubscription = await prisma.subscription.findFirst({
    where: {
      userId: user.id,
      status: { in: [...ACTIVE_SUB_STATUSES] },
    },
    select: { id: true },
  });
  if (activeSubscription) {
    return NextResponse.redirect(
      new URL("/pricing?checkout_error=already_subscribed", origin),
      303,
    );
  }

  try {
    const stripe = getStripe();

    const monthlyRaw =
      process.env.STRIPE_PRO_PRICE_ID?.trim() ||
      process.env.STRIPE_PRO_MONTHLY_PRICE_ID?.trim() ||
      process.env.STRIPE_PRICE_ID?.trim() ||
      process.env.STRIPE_PRO_MONTHLY_PRODUCT_ID?.trim();

    const annualRaw =
      process.env.STRIPE_PRO_ANNUAL_PRICE_ID?.trim() ||
      process.env.STRIPE_PRO_ANNUAL_PRODUCT_ID?.trim();

    const monthlyPriceId = await resolveStripePriceId(stripe, monthlyRaw);
    if (!monthlyPriceId) {
      const code =
        monthlyRaw?.startsWith("prod_") ? "product_no_default_price" : "missing_price_id";
      return NextResponse.redirect(new URL(`/pricing?checkout_error=${code}`, origin), 303);
    }

    let priceId = monthlyPriceId;
    if (billing === "annual") {
      const annualResolved = await resolveStripePriceId(stripe, annualRaw);
      if (annualResolved) {
        priceId = annualResolved;
      }
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || session.user.email,
        name: user.name || session.user.name || undefined,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      });
    } else {
      await stripe.customers.update(customerId, {
        metadata: { userId: user.id },
      });
    }

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${origin}/dashboard?checkout=success`,
      cancel_url: `${origin}/pricing?checkout=cancelled`,
      subscription_data: {
        metadata: {
          userId: user.id,
          product: "ThesisPilot Pro",
        },
        description: "ThesisPilot Pro",
      },
      metadata: {
        userId: user.id,
        product: "ThesisPilot Pro",
      },
      custom_text: {
        submit: {
          message: "ThesisPilot Pro — secure checkout",
        },
      },
    });

    if (!checkout.url) {
      return NextResponse.redirect(new URL("/pricing?checkout_error=no_checkout_url", origin), 303);
    }

    return NextResponse.redirect(checkout.url, 303);
  } catch (err) {
    console.error("[create-checkout-session]", err);
    return NextResponse.redirect(new URL("/pricing?checkout_error=stripe_failed", origin), 303);
  }
}
