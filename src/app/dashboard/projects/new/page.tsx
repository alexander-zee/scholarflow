import { createProjectAction } from "@/actions/project-actions";
import EthicalNotice from "@/components/EthicalNotice";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const error = params.error;

  return (
    <main className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-bold text-slate-900">Create thesis project</h1>
        <p className="mt-1 text-sm text-slate-600">
          Add your thesis context so ScholarFlow can provide relevant feedback.
        </p>
        {error === "max-projects" ? (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Free accounts can only have <span className="font-semibold">one active project</span>. Upgrade to Pro for
            multiple projects, or delete your existing project first.
          </p>
        ) : null}
      </section>

      <EthicalNotice />

      <form action={createProjectAction} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <input name="title" required placeholder="Thesis title" className="w-full rounded-md border border-slate-300 px-3 py-2" />
        <input name="researchQuestion" required placeholder="Research question" className="w-full rounded-md border border-slate-300 px-3 py-2" />
        <div className="grid gap-3 md:grid-cols-3">
          <input name="field" required placeholder="Field (e.g. Psychology)" className="rounded-md border border-slate-300 px-3 py-2" />
          <input name="degreeLevel" required placeholder="University level (e.g. Master)" className="rounded-md border border-slate-300 px-3 py-2" />
          <input name="language" required placeholder="Language (e.g. English)" className="rounded-md border border-slate-300 px-3 py-2" />
        </div>
        <textarea name="description" placeholder="Project description (optional)" rows={4} className="w-full rounded-md border border-slate-300 px-3 py-2" />
        <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white">
          Create project
        </button>
      </form>
    </main>
  );
}
