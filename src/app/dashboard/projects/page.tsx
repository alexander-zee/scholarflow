import Link from "next/link";
import ProjectCard from "@/components/ProjectCard";
import EmptyState from "@/components/EmptyState";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function ProjectsPage() {
  const session = await auth();
  const projects = await prisma.project.findMany({
    where: { userId: session?.user?.id },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <main className="space-y-6 pb-24">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200/90 bg-white/85 p-6 shadow-sm backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between dark:border-cyan-400/12 dark:bg-slate-950/45 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Thesis Projects</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Manage your research projects and section reviews.</p>
        </div>
        <Link
          href="/dashboard/projects/new"
          className="inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-cyan-500 to-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(34,211,238,0.4)] transition hover:brightness-110"
        >
          New Project
        </Link>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create your first thesis project to start receiving structured feedback."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              id={project.id}
              title={project.title}
              field={project.field}
              degreeLevel={project.degreeLevel}
              language={project.language}
            />
          ))}
        </div>
      )}
    </main>
  );
}
