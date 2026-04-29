import { createProjectAction } from "@/actions/project-actions";
import EthicalNotice from "@/components/EthicalNotice";

const shell =
  "rounded-3xl border border-slate-200/90 bg-white/85 p-6 shadow-sm backdrop-blur-xl dark:border-cyan-400/12 dark:bg-slate-950/45 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] md:p-8";

const labelClass =
  "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400";

const fieldClass =
  "w-full min-w-0 rounded-xl border border-slate-300/90 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-500 focus:border-cyan-500/55 focus:ring-2 focus:ring-cyan-500/25 dark:border-white/12 dark:bg-slate-950/55 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:border-cyan-400/45 dark:focus:ring-cyan-400/20";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const error = params.error;

  return (
    <main className="mx-auto max-w-3xl space-y-6 pb-28">
      <section className={shell}>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white md:text-3xl">Create thesis project</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300 md:text-base">
          Add your thesis context so ThesisPilot can provide relevant feedback.
        </p>
        {error === "max-projects" ? (
          <p className="mt-4 rounded-xl border border-amber-300/90 bg-amber-50 p-3.5 text-sm text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/45 dark:text-amber-50">
            Free accounts can only have <span className="font-semibold">one active project</span>. Upgrade to Pro for
            multiple projects, or delete your existing project first.
          </p>
        ) : null}
      </section>

      <EthicalNotice />

      <form action={createProjectAction} className={`${shell} space-y-5`}>
        <div>
          <label htmlFor="project-title" className={labelClass}>
            Thesis title
          </label>
          <input
            id="project-title"
            name="title"
            required
            autoComplete="off"
            placeholder="Working title of your thesis"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="project-rq" className={labelClass}>
            Research question
          </label>
          <input
            id="project-rq"
            name="researchQuestion"
            required
            autoComplete="off"
            placeholder="Main question your thesis answers"
            className={fieldClass}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label htmlFor="project-field" className={labelClass}>
              Field
            </label>
            <input
              id="project-field"
              name="field"
              required
              placeholder="e.g. Psychology"
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="project-degree" className={labelClass}>
              Level
            </label>
            <input
              id="project-degree"
              name="degreeLevel"
              required
              placeholder="e.g. Master"
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="project-lang" className={labelClass}>
              Language
            </label>
            <input
              id="project-lang"
              name="language"
              required
              placeholder="e.g. English"
              className={fieldClass}
            />
          </div>
        </div>
        <div>
          <label htmlFor="project-desc" className={labelClass}>
            Description <span className="font-normal normal-case text-slate-500 dark:text-slate-500">(optional)</span>
          </label>
          <textarea
            id="project-desc"
            name="description"
            placeholder="Context, scope, or notes for the workspace (optional)"
            rows={5}
            className={`${fieldClass} resize-y leading-relaxed`}
          />
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-200/80 pt-6 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            You can edit project details later from the workspace.
          </p>
          <button
            type="submit"
            className="inline-flex w-full shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-cyan-500 via-sky-500 to-teal-500 px-8 py-3 text-sm font-semibold text-white shadow-[0_8px_28px_-8px_rgba(34,211,238,0.45),inset_0_1px_0_rgba(255,255,255,0.25)] transition hover:brightness-110 sm:w-auto"
          >
            Create project
          </button>
        </div>
      </form>
    </main>
  );
}
