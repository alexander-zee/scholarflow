import { format } from "date-fns";
import Link from "next/link";
import { auth } from "@/auth";
import CopyUserIdButton from "@/components/settings/CopyUserIdButton";
import SettingsSignOutButton from "@/components/settings/SettingsSignOutButton";
import { getOrCreateUsageLimit } from "@/lib/usage";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

function resolveSupportEmail() {
  const explicit = process.env.SUPPORT_INBOX_EMAIL?.trim();
  if (explicit) return explicit;
  const admins = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (admins[0]) return admins[0];
  return "";
}

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/settings");
  }

  const userId = session.user.id;
  const [user, usage] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        subscriptionPlan: true,
        subscriptionStatus: true,
        _count: { select: { projects: true } },
      },
    }),
    getOrCreateUsageLimit(userId),
  ]);

  if (!user) {
    redirect("/auth/signin?callbackUrl=/settings");
  }

  const email = user.email || session.user.email || "";
  const displayName = user.name?.trim() || email.split("@")[0] || "Scholar";
  const isPro = user.subscriptionPlan === "pro";
  const planTitle = isPro ? "Pro" : "Starter";
  const planSubtitle = isPro
    ? "Higher monthly AI review limits and more headroom for long-form thesis work."
    : "Basic access with essential features — upgrade when you need more reviews and projects.";
  const supportEmail = resolveSupportEmail();
  const memberSince = format(user.createdAt, "MMM d, yyyy");

  const initials = displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <main className="min-h-[calc(100dvh-5.5rem)] bg-[#070a12] pb-20 pt-8 text-slate-100 md:min-h-[calc(100dvh-6rem)] md:pt-10">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <header className="mb-10 flex items-start gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500/25 to-cyan-600/35 ring-1 ring-teal-400/35"
            aria-hidden
          >
            <svg className="h-6 w-6 text-teal-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path
                d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">Settings</h1>
            <p className="mt-1 text-sm text-slate-400 md:text-base">
              Manage your account, subscription, and ThesisPilot preferences.
            </p>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(260px,320px)_1fr] lg:items-start">
          {/* Profile column */}
          <aside className="overflow-hidden rounded-2xl border border-slate-800/90 bg-slate-900/70 shadow-2xl shadow-black/50 ring-1 ring-white/[0.04] backdrop-blur-md">
            <div className="h-28 bg-gradient-to-r from-teal-600 via-teal-500 to-cyan-600" />
            <div className="relative -mt-14 flex flex-col items-center px-5 pb-2">
              <div className="relative">
                {user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- OAuth avatars from arbitrary hosts
                  <img
                    src={user.image}
                    alt=""
                    className="h-28 w-28 rounded-full border-4 border-slate-900 object-cover shadow-lg"
                  />
                ) : (
                  <div className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-slate-900 bg-gradient-to-br from-slate-700 to-slate-800 text-2xl font-bold text-slate-200 shadow-lg">
                    {initials}
                  </div>
                )}
                <span
                  className="absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-900 bg-slate-800 text-slate-400 shadow-md"
                  title="Profile photo comes from your sign-in provider"
                  aria-hidden
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </span>
              </div>
              <h2 className="mt-4 text-center text-xl font-bold text-white">{displayName}</h2>
              <p className="mt-1 text-center text-xs text-slate-500">ThesisPilot account</p>
            </div>

            <div className="space-y-4 px-5 pb-6 pt-2">
              <div className="flex items-start gap-3 rounded-xl bg-slate-950/50 px-3 py-2.5 ring-1 ring-white/[0.06]">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400/90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Email</p>
                  <p className="truncate text-sm text-slate-200">{email || "—"}</p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl bg-slate-950/50 px-3 py-2.5 ring-1 ring-white/[0.06]">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400/90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Language</p>
                  <p className="text-sm text-slate-200">English</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">Thesis language is set per project in the workspace.</p>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-xl bg-slate-950/50 px-3 py-2.5 ring-1 ring-white/[0.06]">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400/90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">User ID</p>
                  <p className="break-all font-mono text-[11px] leading-snug text-slate-300">{user.id}</p>
                </div>
                <CopyUserIdButton userId={user.id} />
              </div>
            </div>

            <div className="border-t border-slate-800/90 p-5">
              <SettingsSignOutButton />
            </div>
          </aside>

          {/* Right column */}
          <div className="flex flex-col gap-6">
            <section className="relative overflow-hidden rounded-2xl border border-slate-800/90 bg-slate-900/70 p-6 shadow-xl shadow-black/40 ring-1 ring-white/[0.04] backdrop-blur-md md:p-7">
              <div className="absolute right-5 top-5 text-teal-400/90" aria-hidden>
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm2.7 2h8.6l1.1-5H6.6l1.1 5z" />
                </svg>
              </div>
              <p className="text-sm text-slate-400">Subscription</p>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-500">{planSubtitle}</p>

              <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-400/90">Current plan</p>
                  <p className="mt-1 text-3xl font-bold tracking-tight text-white md:text-4xl">{planTitle}</p>
                  {user.subscriptionStatus && user.subscriptionStatus !== "free" ? (
                    <p className="mt-1 text-xs capitalize text-slate-500">Status: {user.subscriptionStatus}</p>
                  ) : null}
                </div>
                {!isPro ? (
                  <Link
                    href="/pricing"
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-900/30 transition hover:from-teal-500 hover:to-cyan-500"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M12 2l2.4 7.4h7.6l-6 4.6 2.3 7-6.3-4.6-6.3 4.6 2.3-7-6-4.6h7.6z" />
                    </svg>
                    Upgrade
                  </Link>
                ) : (
                  <Link
                    href="/billing"
                    className="inline-flex items-center gap-2 rounded-xl border border-teal-500/50 bg-teal-500/10 px-5 py-2.5 text-sm font-semibold text-teal-100 transition hover:border-teal-400 hover:bg-teal-500/20"
                  >
                    Manage billing
                  </Link>
                )}
              </div>

              <div className="mt-10 grid gap-6 border-t border-slate-800/80 pt-8 sm:grid-cols-2">
                <div className="flex gap-3">
                  <svg className="h-4 w-4 shrink-0 text-cyan-400/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">AI reviews (this month)</p>
                    <p className="mt-0.5 text-sm font-medium text-slate-200">
                      {usage.aiReviewsUsed} / {usage.aiReviewsLimit} used
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <svg className="h-4 w-4 shrink-0 text-cyan-400/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Member since</p>
                    <p className="mt-0.5 text-sm font-medium text-slate-200">{memberSince}</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="relative overflow-hidden rounded-2xl border border-slate-800/90 bg-slate-900/70 p-6 shadow-xl shadow-black/40 ring-1 ring-white/[0.04] backdrop-blur-md md:p-7">
              <div className="absolute right-5 top-5 text-cyan-400/90" aria-hidden>
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-white">Thesis workspace</h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
                You have{" "}
                <span className="font-semibold text-slate-300">{user._count.projects}</span> thesis{" "}
                {user._count.projects === 1 ? "project" : "projects"}. Create projects, upload references, generate outlines and draft
                scaffolding, then revise in the writing studio with structured reviews, anchored supervisor comments, and short chat tuned
                for your next best edit — with integrity-first guardrails.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full border border-slate-700/90 bg-slate-950/60 px-3 py-1 text-xs font-medium text-slate-300">
                  Projects &amp; references
                </span>
                <span className="rounded-full border border-slate-700/90 bg-slate-950/60 px-3 py-1 text-xs font-medium text-slate-300">
                  Writing studio
                </span>
                <span className="rounded-full border border-slate-700/90 bg-slate-950/60 px-3 py-1 text-xs font-medium text-slate-300">
                  Structured review
                </span>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  href="/dashboard/projects"
                  className="inline-flex items-center gap-2 rounded-xl border border-teal-500/55 bg-transparent px-5 py-2.5 text-sm font-semibold text-teal-200 transition hover:border-teal-400 hover:bg-teal-500/10 hover:text-white"
                >
                  Open projects
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
                <Link href="/academic-integrity" className="text-xs font-medium text-slate-500 underline-offset-4 hover:text-slate-300">
                  Academic integrity guidelines
                </Link>
              </div>
            </section>
          </div>
        </div>

        <footer className="mt-16 border-t border-slate-800/60 pt-10 text-center">
          <p className="text-sm text-slate-500">Need assistance? Contact our support team</p>
          {supportEmail ? (
            <a
              href={`mailto:${supportEmail}`}
              className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-teal-400 transition hover:text-teal-300"
            >
              {supportEmail}
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M7 17L17 7M17 7H7M17 7v10" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              Use the blue support bubble — or configure <code className="text-slate-400">SUPPORT_INBOX_EMAIL</code> for email.
            </p>
          )}
        </footer>
      </div>
    </main>
  );
}
