import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  return (
    <main className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-bold text-slate-900">Billing</h1>
        <p className="mt-2 text-sm text-slate-600">
          Manage your subscription and payment methods through Stripe Billing Portal.
        </p>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <form action="/api/stripe/portal" method="POST">
          <button className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white">
            Open Billing Portal
          </button>
        </form>
      </section>
    </main>
  );
}
