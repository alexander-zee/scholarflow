import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export const runtime = "nodejs";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

function resolveSupportInbox() {
  const explicit = process.env.SUPPORT_INBOX_EMAIL?.trim();
  if (explicit) return explicit;
  const admins = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (admins.length > 0) return admins[0];
  return process.env.EMAIL_SERVER_USER?.trim() || "";
}

export async function POST(request: Request) {
  const host = process.env.EMAIL_SERVER_HOST;
  const port = Number(process.env.EMAIL_SERVER_PORT || "587");
  const user = process.env.EMAIL_SERVER_USER;
  const pass = process.env.EMAIL_SERVER_PASSWORD;
  const from = process.env.EMAIL_FROM || "ThesisPilot <no-reply@thesispilot.local>";
  const to = resolveSupportInbox();

  if (!host || !user || !pass || !to) {
    return NextResponse.json(
      { error: "Support email is not configured yet." },
      { status: 500 },
    );
  }

  const formData = await request.formData();
  const message = String(formData.get("message") || "").trim();
  const attachment = formData.get("attachment");

  if (message.length < 5) {
    return NextResponse.json({ error: "Please enter a longer message." }, { status: 400 });
  }

  let attachments: { filename: string; content: Buffer; contentType?: string }[] = [];
  if (attachment instanceof File && attachment.size > 0) {
    if (attachment.size > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json(
        { error: "Attachment too large (max 10MB)." },
        { status: 400 },
      );
    }
    const inferredName = attachment.name || "attachment";
    const lowerName = inferredName.toLowerCase();
    const mimeType = attachment.type || "application/octet-stream";
    const allowedByExt =
      lowerName.endsWith(".pdf") || lowerName.endsWith(".doc") || lowerName.endsWith(".docx") || lowerName.endsWith(".txt");
    if (!ALLOWED_MIME_TYPES.has(mimeType) && !allowedByExt) {
      return NextResponse.json(
        { error: "Only PDF or Word files are allowed." },
        { status: 400 },
      );
    }
    const content = Buffer.from(await attachment.arrayBuffer());
    attachments = [{ filename: inferredName, content, contentType: mimeType }];
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transport.sendMail({
    from,
    to,
    replyTo: from,
    subject: "ThesisPilot support message",
    text: `New support message:\n\n${message}\n`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>New ThesisPilot support message</h2>
        <p><strong>Message:</strong></p>
        <p style="white-space: pre-wrap;">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
      </div>
    `,
    attachments,
  });

  return NextResponse.json({ success: true });
}

