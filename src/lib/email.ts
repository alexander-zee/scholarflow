import nodemailer from "nodemailer";

function appBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL || "http://localhost:3000";
}

export async function sendVerificationEmail(email: string, token: string) {
  const verificationUrl = `${appBaseUrl()}/api/auth/verify-email?token=${encodeURIComponent(token)}`;

  const host = process.env.EMAIL_SERVER_HOST;
  const port = Number(process.env.EMAIL_SERVER_PORT || "587");
  const user = process.env.EMAIL_SERVER_USER;
  const pass = process.env.EMAIL_SERVER_PASSWORD;
  const from = process.env.EMAIL_FROM || "ThesisPilot <no-reply@thesispilot.local>";

  if (!host || !user || !pass) {
    return { sent: false, verificationUrl };
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transport.sendMail({
    from,
    to: email,
    subject: "Confirm your ThesisPilot account",
    html: `
      <div style="font-family: Arial, sans-serif; line-height:1.5">
        <h2>Confirm your ThesisPilot account</h2>
        <p>Thanks for signing up. Confirm your email to activate your account.</p>
        <p>
          <a href="${verificationUrl}" style="display:inline-block;padding:10px 16px;background:#0ea5e9;color:#fff;border-radius:8px;text-decoration:none;">
            Verify email
          </a>
        </p>
        <p>If you did not create this account, you can safely ignore this email.</p>
      </div>
    `,
  });

  return { sent: true, verificationUrl };
}
