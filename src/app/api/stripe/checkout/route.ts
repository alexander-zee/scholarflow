import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

export async function POST() {
  const stripe = getStripe();
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  const customer =
    user?.stripeCustomerId ||
    (
      await stripe.customers.create({
        email: session.user.email,
        name: session.user.name || undefined,
      })
    ).id;

  if (!user?.stripeCustomerId) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { stripeCustomerId: customer },
    });
  }

  // Replace price ID with your Stripe product price ID.
  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price: "price_pro_monthly_placeholder", quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
  });

  return NextResponse.json({ url: checkout.url });
}
