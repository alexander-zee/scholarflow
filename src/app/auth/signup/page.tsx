"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const fieldClass =
  "w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500";

export default function SignUpPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [verificationUrl, setVerificationUrl] = useState("");
  const [lastEmail, setLastEmail] = useState("");
  const [resendMessage, setResendMessage] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(formData: FormData) {
    setError("");
    setResendMessage("");
    setLoading(true);
    const name = String(formData.get("name") || "");
    const email = String(formData.get("email") || "");
    const password = String(formData.get("password") || "");
    const confirm = String(formData.get("confirmPassword") || "");

    if (password !== confirm) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      setLoading(false);
      return;
    }

    setLastEmail(email);
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const json = await response.json();
    if (!response.ok) {
      setError(json.error || "Signup failed.");
      if (String(json.error || "").toLowerCase().includes("already exists")) {
        setResendMessage("If this account is not verified yet, you can resend verification email.");
      }
      setLoading(false);
      return;
    }
    setMessage(json.message || "Account created. Please verify your email.");
    setVerificationUrl(json.verificationUrl || "");
    setLoading(false);
  }

  async function onResend() {
    if (!lastEmail) return;
    setError("");
    setResendMessage("");
    setResendLoading(true);
    const response = await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: lastEmail }),
    });
    const json = await response.json();
    if (!response.ok) {
      setError(json.error || "Could not resend verification email.");
      setResendLoading(false);
      return;
    }
    setResendMessage(json.message || "Verification email sent.");
    if (json.verificationUrl) {
      setVerificationUrl(json.verificationUrl);
    }
    setResendLoading(false);
  }

  return (
    <main className="w-full max-w-[440px]">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Sign Up</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        By signing up for ThesisPilot, you accept the{" "}
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
            <label htmlFor="signup-name" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Name
            </label>
            <input
              id="signup-name"
              name="name"
              required
              autoComplete="name"
              placeholder="Enter your name"
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="signup-email" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Email
            </label>
            <input
              id="signup-email"
              name="email"
              required
              type="email"
              autoComplete="email"
              placeholder="Enter your email"
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="signup-password" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Password
            </label>
            <input
              id="signup-password"
              name="password"
              required
              type="password"
              autoComplete="new-password"
              placeholder="Enter your password"
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="signup-confirm" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Confirm password
            </label>
            <input
              id="signup-confirm"
              name="confirmPassword"
              required
              type="password"
              autoComplete="new-password"
              placeholder="Enter your password"
              className={fieldClass}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[#1D4ED8] py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1e40af] disabled:opacity-60"
          >
            {loading ? "Creating account…" : "Sign Up"}
          </button>
          {error ? <p className="text-center text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          {message ? <p className="text-center text-sm text-emerald-700 dark:text-emerald-400">{message}</p> : null}
          {(message || error) && lastEmail ? (
            <button
              type="button"
              onClick={onResend}
              disabled={resendLoading}
              className="w-full text-center text-sm font-semibold text-[#1D4ED8] underline decoration-[#1D4ED8]/40 underline-offset-2 disabled:opacity-60 dark:text-blue-400"
            >
              {resendLoading ? "Resending…" : "Resend verification email"}
            </button>
          ) : null}
          {resendMessage ? <p className="text-center text-sm text-emerald-700 dark:text-emerald-400">{resendMessage}</p> : null}
          {verificationUrl ? (
            <button
              type="button"
              onClick={() => router.push(verificationUrl)}
              className="w-full text-center text-sm font-semibold text-[#1D4ED8] underline decoration-[#1D4ED8]/40 underline-offset-2 dark:text-blue-400"
            >
              Open verification link (local dev)
            </button>
          ) : null}
        </form>

        <p className="text-center text-sm text-slate-600 dark:text-slate-400">
          Already have an account?{" "}
          <Link href="/auth/signin" className="font-semibold text-[#1D4ED8] hover:underline dark:text-blue-400">
            Login
          </Link>
        </p>
      </div>
    </main>
  );
}
