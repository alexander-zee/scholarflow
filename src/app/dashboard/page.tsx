import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import DocumentsProjectCard from "@/components/DocumentsProjectCard";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return null;
  }

  const projects = await prisma.project.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 36,
  });

  const projectIds = projects.map((p) => p.id);
  const exportableIds = new Set<string>();
  if (projectIds.length > 0) {
    const grouped = await prisma.documentSection.groupBy({
      by: ["projectId"],
      where: {
        projectId: { in: projectIds },
        sectionType: { in: ["draft_chapter", "outline_suggested"] },
      },
      _count: { _all: true },
    });
    for (const row of grouped) {
      exportableIds.add(row.projectId);
    }
  }

  return (
    <main className="space-y-8 pb-28">
      <div className="rounded-3xl border border-slate-200/90 bg-white/85 px-6 py-8 shadow-[0_12px_40px_-20px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl dark:border-cyan-400/12 dark:bg-slate-950/45 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_64px_-28px_rgba(0,0,0,0.45),0_0_48px_-24px_rgba(34,211,238,0.08)] md:px-10 md:py-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white md:text-[2.35rem]">Documents</h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-300">
              Download or export your thesis drafts. Generate an outline or full draft in the workspace first, then use
              PDF, Word, or other formats here.
            </p>
          </div>
          <div className="flex flex-shrink-0 flex-wrap gap-3">
            <Link
              href="/dashboard/projects/new"
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-cyan-500 via-sky-500 to-teal-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_28px_-8px_rgba(34,211,238,0.45),inset_0_1px_0_rgba(255,255,255,0.25)] transition hover:brightness-110"
            >
              New thesis
            </Link>
          </div>
        </div>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title="No documents yet"
          description="Create a thesis project, upload references, and generate a draft — then your downloads will appear here."
        />
      ) : (
        <section>
          <h2 className="sr-only">Your thesis projects</h2>
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <DocumentsProjectCard
                key={project.id}
                projectId={project.id}
                title={project.title}
                field={project.field}
                degreeLevel={project.degreeLevel}
                language={project.language}
                canExport={exportableIds.has(project.id)}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
