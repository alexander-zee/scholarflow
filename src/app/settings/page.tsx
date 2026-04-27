import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }
  return (
    <main className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-bold text-slate-900">Account settings</h1>
        <p className="mt-2 text-sm text-slate-600">Manage your account preferences and profile details.</p>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
        <p><span className="font-semibold">Signed in as:</span> {session?.user?.email || "Unknown user"}</p>
        <p className="mt-2">More settings (notification preferences, export controls) can be added next.</p>
      </section>
    </main>
  );
}
