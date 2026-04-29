import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";

const PRO_STATUSES: Stripe.Subscription.Status[] = ["active", "trialing", "past_due"];

function deriveUserPlanFields(status: Stripe.Subscription.Status): { plan: string; subscriptionStatus: string } {
  if (PRO_STATUSES.includes(status)) {
    return { plan: "pro", subscriptionStatus: status };
  }
  return { plan: "free", subscriptionStatus: status === "canceled" ? "canceled" : status };
}

/**
 * Upserts Subscription row and updates User plan fields from a Stripe Subscription object.
 */
export async function syncUserFromStripeSubscription(
  subscription: Stripe.Subscription,
  explicitUserId?: string | null,
): Promise<void> {
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  let user =
    (explicitUserId
      ? await prisma.user.findUnique({ where: { id: explicitUserId }, select: { id: true, stripeCustomerId: true } })
      : null) ||
    (await prisma.user.findFirst({
      where: { stripeCustomerId: customerId },
      select: { id: true, stripeCustomerId: true },
    }));

  const metaUserId = subscription.metadata?.userId;
  if (!user && metaUserId) {
    user = await prisma.user.findUnique({
      where: { id: metaUserId },
      select: { id: true, stripeCustomerId: true },
    });
  }

  if (!user) {
    return;
  }

  if (!user.stripeCustomerId) {
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const { plan, subscriptionStatus } = deriveUserPlanFields(subscription.status);
  const periodEndUnix = (subscription as unknown as { current_period_end?: number }).current_period_end;
  const periodEnd = periodEndUnix ? new Date(periodEndUnix * 1000) : null;

  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: subscription.id },
    update: {
      status: subscription.status,
      plan: plan === "pro" ? "pro" : "free",
      currentPeriodEnd: periodEnd,
      stripeCustomerId: customerId,
    },
    create: {
      userId: user.id,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      status: subscription.status,
      plan: plan === "pro" ? "pro" : "free",
      currentPeriodEnd: periodEnd,
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      stripeCustomerId: customerId,
      subscriptionPlan: plan,
      subscriptionStatus,
    },
  });
}

export async function markUserFreeAfterSubscriptionRemoved(
  stripeSubscriptionId: string,
  customerId: string,
): Promise<void> {
  const row = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId },
    select: { userId: true, id: true },
  });
  if (row) {
    await prisma.subscription.update({
      where: { id: row.id },
      data: { status: "canceled", plan: "free" },
    });
    await prisma.user.update({
      where: { id: row.userId },
      data: { subscriptionPlan: "free", subscriptionStatus: "canceled" },
    });
    return;
  }

  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: { subscriptionPlan: "free", subscriptionStatus: "canceled" },
    });
  }
}
