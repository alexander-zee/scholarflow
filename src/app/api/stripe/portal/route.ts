import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { resolveAppOrigin } from "@/lib/stripe-app-origin";

const PAID_STATUSES = new Set(["active", "trialing", "past_due"]);

export async function POST(request: Request) {
  const stripe = getStripe();
  const session = await auth();
  const appOrigin = await resolveAppOrigin(request);

  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/auth/signin?callbackUrl=/billing", appOrigin), 303);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      stripeCustomerId: true,
      email: true,
      name: true,
      subscriptionPlan: true,
      subscriptionStatus: true,
    },
  });

  if (!user?.email) {
    return NextResponse.redirect(new URL("/pricing", appOrigin), 303);
  }

  const status = (user.subscriptionStatus || "free").toLowerCase();
  const canUsePortal =
    user.subscriptionPlan === "pro" && PAID_STATUSES.has(status) && Boolean(user.stripeCustomerId);

  if (!canUsePortal) {
    return NextResponse.redirect(new URL("/pricing?checkout=portal_requires_pro", appOrigin), 303);
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId!,
    return_url: `${appOrigin}/billing`,
  });

  return NextResponse.redirect(portal.url, 303);
}
