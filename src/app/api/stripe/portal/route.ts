import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const stripe = getStripe();
  const session = await auth();
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/auth/signin", appOrigin), 303);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, stripeCustomerId: true, email: true, name: true },
  });

  if (!user?.email) {
    return NextResponse.redirect(new URL("/pricing", appOrigin), 303);
  }

  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name || undefined,
      metadata: { userId: user.id },
    });
    customerId = customer.id;
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appOrigin}/billing`,
  });

  return NextResponse.redirect(portal.url, 303);
}
