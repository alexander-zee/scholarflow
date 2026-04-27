import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/email";

const resendSchema = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  const json = await request.json();
  const parsed = resendSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email." }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { emailVerified: true },
  });

  // Avoid account enumeration: same response for missing/verified accounts.
  if (!user || user.emailVerified) {
    return NextResponse.json({
      success: true,
      message: "If an unverified account exists, we sent a new verification email.",
    });
  }

  await prisma.verificationToken.deleteMany({ where: { identifier: email } });
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token,
      expires: new Date(Date.now() + 1000 * 60 * 60 * 24),
    },
  });

  const emailResult = await sendVerificationEmail(email, token);

  return NextResponse.json({
    success: true,
    message: "Verification email sent.",
    verificationUrl: emailResult.sent ? undefined : emailResult.verificationUrl,
  });
}
