import Link from "next/link";

export default function VerifiedPage() {
  return (
    <main className="mx-auto w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold text-slate-900">Email verified</h1>
      <p className="mt-2 text-sm text-slate-600">
        Your account is now confirmed. You can sign in and start using ThesisPilot.
      </p>
      <Link
        href="/auth/signin"
        className="mt-5 inline-block rounded-md bg-blue-600 px-4 py-2 font-medium text-white"
      >
        Continue to sign in
      </Link>
    </main>
  );
}
