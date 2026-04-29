import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import {
  markUserFreeAfterSubscriptionRemoved,
  syncUserFromStripeSubscription,
} from "@/lib/stripe-subscription-sync";

export async function POST(request: Request) {
  const stripe = getStripe();
  const body = await request.text();
  const signature = (await headers()).get("stripe-signature");
  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing webhook signature." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;
        const rawSub = session.subscription;
        const subId = typeof rawSub === "string" ? rawSub : rawSub?.id;
        if (!subId) break;
        const subscription = await stripe.subscriptions.retrieve(subId);
        const userId = session.client_reference_id || session.metadata?.userId || null;
        await syncUserFromStripeSubscription(subscription, userId);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncUserFromStripeSubscription(subscription, subscription.metadata?.userId || null);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id;
        await markUserFreeAfterSubscriptionRemoved(subscription.id, customerId);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("[stripe webhook]", event.type, err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
