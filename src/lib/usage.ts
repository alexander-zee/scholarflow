import { prisma } from "@/lib/prisma";

export const FREE_REVIEW_LIMIT = 3;
export const PRO_REVIEW_LIMIT = 60;
export const ADMIN_REVIEW_LIMIT = 9999;

function getAdminEmails() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

/** Emails listed in `ADMIN_EMAILS` (comma-separated) get testing limits and project-cap exceptions. */
export function isAdminEmail(email?: string | null) {
  if (!email) return false;
  const admins = getAdminEmails();
  return admins.includes(email.toLowerCase());
}

export function currentUsageMonth() {
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return month;
}

export async function getOrCreateUsageLimit(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionPlan: true, email: true },
  });
  // Can happen with stale session cookies pointing to a user id
  // that doesn't exist in the current database (e.g. switched DB env).
  // Return a safe fallback instead of crashing on FK create.
  if (!user) {
    return {
      id: "missing-user-fallback",
      userId,
      month: currentUsageMonth(),
      aiReviewsUsed: 0,
      aiReviewsLimit: FREE_REVIEW_LIMIT,
    };
  }
  const computedLimit = isAdminEmail(user?.email)
    ? ADMIN_REVIEW_LIMIT
    : user?.subscriptionPlan === "pro"
      ? PRO_REVIEW_LIMIT
      : FREE_REVIEW_LIMIT;

  const month = currentUsageMonth();
  const existing = await prisma.usageLimit.findUnique({
    where: { userId_month: { userId, month } },
  });

  if (existing) {
    if (existing.aiReviewsLimit !== computedLimit) {
      return prisma.usageLimit.update({
        where: { id: existing.id },
        data: { aiReviewsLimit: computedLimit },
      });
    }
    return existing;
  }

  return prisma.usageLimit.create({
    data: {
      userId,
      month,
      aiReviewsLimit: computedLimit,
      aiReviewsUsed: 0,
    },
  });
}

export async function ensureUsageAllowed(userId: string) {
  const usage = await getOrCreateUsageLimit(userId);
  if (usage.aiReviewsLimit >= ADMIN_REVIEW_LIMIT) {
    return { allowed: true, usage };
  }
  if (usage.aiReviewsUsed >= usage.aiReviewsLimit) {
    return { allowed: false, usage };
  }
  return { allowed: true, usage };
}

export async function incrementUsage(userId: string) {
  const usage = await getOrCreateUsageLimit(userId);
  if (usage.aiReviewsLimit >= ADMIN_REVIEW_LIMIT) {
    return;
  }
  await prisma.usageLimit.update({
    where: { id: usage.id },
    data: { aiReviewsUsed: { increment: 1 } },
  });
}
