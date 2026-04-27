"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function SignInPage() {
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
      callbackUrl: "/dashboard",
    });

    if (result?.error) {
      setError("Invalid email or password.");
      setLoading(false);
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <main className="mx-auto w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold text-slate-900">Sign in</h1>
      <p className="mt-1 text-sm text-slate-600">Continue improving your academic writing.</p>
      <form action={onSubmit} className="mt-5 space-y-3">
        <input name="email" type="email" required placeholder="Email" className="w-full rounded-md border border-slate-300 px-3 py-2" />
        <input name="password" type="password" required placeholder="Password" className="w-full rounded-md border border-slate-300 px-3 py-2" />
        <button disabled={loading} className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-60">
          {loading ? "Signing in..." : "Sign in"}
        </button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>
      <p className="mt-4 text-sm text-slate-600">
        No account yet? <a className="text-blue-700" href="/auth/signup">Create one</a>
      </p>
    </main>
  );
}
