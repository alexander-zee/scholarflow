import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const stripe = getStripe();
  const body = await request.text();
  const signature = (await headers()).get("stripe-signature");
  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing webhook signature." }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;
    const subId = subscription.id;
    const status = subscription.status;
    const plan = subscription.items.data[0]?.price?.nickname || "pro";
    const periodEndUnix = (subscription as unknown as { current_period_end?: number }).current_period_end;
    const periodEnd = periodEndUnix ? new Date(periodEndUnix * 1000) : null;

    const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
    if (user) {
      await prisma.subscription.upsert({
        where: { stripeSubscriptionId: subId },
        update: {
          status,
          plan,
          currentPeriodEnd: periodEnd,
        },
        create: {
          userId: user.id,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subId,
          status,
          plan,
          currentPeriodEnd: periodEnd,
        },
      });

      await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionStatus: status,
          subscriptionPlan: plan,
        },
      });
    }
  }

  return NextResponse.json({ received: true });
}
