import Link from "next/link";

export default function VerifiedPage() {
  return (
    <main className="w-full max-w-[440px]">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Email verified</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        Your account is now confirmed. You can sign in and start using ThesisPilot.
      </p>
      <Link
        href="/auth/signin"
        className="mt-8 inline-flex w-full items-center justify-center rounded-full bg-[#1D4ED8] py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1e40af]"
      >
        Continue to sign in
      </Link>
    </main>
  );
}
