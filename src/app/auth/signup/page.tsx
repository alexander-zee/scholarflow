"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    const payload = {
      name: String(formData.get("name") || ""),
      email: String(formData.get("email") || ""),
      password: String(formData.get("password") || ""),
    };
    setLastEmail(payload.email);
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await response.json();
    if (!response.ok) {
      setError(json.error || "Signup failed.");
      // Keep resend available when account already exists but is unverified.
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
    <main className="mx-auto w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold text-slate-900">Create account</h1>
      <p className="mt-1 text-sm text-slate-600">Start improving your thesis with ethical AI feedback.</p>
      <form action={onSubmit} className="mt-5 space-y-3">
        <input name="name" required placeholder="Full name" className="w-full rounded-md border border-slate-300 px-3 py-2" />
        <input name="email" required type="email" placeholder="Email" className="w-full rounded-md border border-slate-300 px-3 py-2" />
        <input name="password" required type="password" placeholder="Password (min. 8 chars)" className="w-full rounded-md border border-slate-300 px-3 py-2" />
        <button disabled={loading} className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-60">
          {loading ? "Creating..." : "Create account"}
        </button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        {(message || error) && lastEmail ? (
          <button
            type="button"
            onClick={onResend}
            disabled={resendLoading}
            className="text-sm font-medium text-blue-700 underline disabled:opacity-60"
          >
            {resendLoading ? "Resending..." : "Resend verification email"}
          </button>
        ) : null}
        {resendMessage ? <p className="text-sm text-emerald-700">{resendMessage}</p> : null}
        {verificationUrl ? (
          <button
            type="button"
            onClick={() => router.push(verificationUrl)}
            className="text-sm font-medium text-blue-700 underline"
          >
            Open verification link (local dev)
          </button>
        ) : null}
      </form>
    </main>
  );
}
