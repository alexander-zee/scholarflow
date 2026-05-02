"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

const fieldClass =
  "w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500";

function SignInForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(formData: FormData) {
    setError("");
    setLoading(true);
    const email = String(formData.get("email") || "");
    const password = String(formData.get("password") || "");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl,
    });

    if (result?.error) {
      setError("Invalid email or password.");
      setLoading(false);
      return;
    }

    window.location.href = callbackUrl.startsWith("/") ? callbackUrl : "/dashboard";
  }

  return (
    <main className="w-full max-w-[440px]">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Login</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        By signing in to ThesisPilot, you accept the{" "}
        <Link href="/terms" className="font-medium text-[#1D4ED8] hover:underline dark:text-blue-400">
          terms
        </Link>{" "}
        &amp;{" "}
        <Link href="/privacy" className="font-medium text-[#1D4ED8] hover:underline dark:text-blue-400">
          policies
        </Link>
        .
      </p>

      <div className="mt-8 space-y-4">
        <form action={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="signin-email" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Email
            </label>
            <input
              id="signin-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="Enter your email"
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="signin-password" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Password
            </label>
            <input
              id="signin-password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Enter your password"
              className={fieldClass}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[#1D4ED8] py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1e40af] disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
          {error ? <p className="text-center text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        </form>

        <p className="text-center text-sm text-slate-600 dark:text-slate-400">
          No account yet?{" "}
          <Link href="/auth/signup" className="font-semibold text-[#1D4ED8] hover:underline dark:text-blue-400">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-[440px] animate-pulse rounded-3xl border border-slate-200/80 bg-white/60 p-8 dark:border-slate-700 dark:bg-slate-900/60">
          <div className="h-8 w-40 rounded-lg bg-slate-200 dark:bg-slate-700" />
          <div className="mt-4 h-4 w-full rounded bg-slate-100 dark:bg-slate-800" />
        </div>
      }
    >
      <SignInForm />
    </Suspense>
  );
}
