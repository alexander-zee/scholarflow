import EthicalNotice from "@/components/EthicalNotice";

export default function AcademicIntegrityPage() {
  return (
    <main className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-8">
        <h1 className="text-3xl font-bold text-slate-900">Academic integrity</h1>
        <p className="mt-2 text-slate-700">
          ScholarFlow is an AI writing coach, not a ghostwriting tool.
        </p>
      </section>
      <EthicalNotice />
    </main>
  );
}
