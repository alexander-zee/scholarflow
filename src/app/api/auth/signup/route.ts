import { NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/email";

const signupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  const json = await request.json();
  const parsed = signupSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid signup payload." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });
  if (existing) {
    return NextResponse.json({ error: "Email already exists." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const email = parsed.data.email.toLowerCase();
  await prisma.user.create({
    data: {
      name: parsed.data.name,
      email,
      passwordHash,
      subscriptionPlan: "free",
      subscriptionStatus: "free",
    },
  });

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
    message: "Account created. Check your email to verify your account.",
    verificationUrl: emailResult.sent ? undefined : emailResult.verificationUrl,
  });
}
