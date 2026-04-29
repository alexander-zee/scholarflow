import { headers } from "next/headers";

/** Canonical public origin: APP_URL, then NEXT_PUBLIC_APP_URL, then request-derived. */
export async function resolveAppOrigin(request: Request): Promise<string> {
  const explicit = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
  if (explicit) return explicit;

  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host");
  const proto = h.get("x-forwarded-proto") || "https";
  if (host) return `${proto}://${host}`;

  return new URL(request.url).origin.replace(/\/$/, "");
}
