import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import ProjectCard from "@/components/ProjectCard";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const session = await auth();
  const projects = await prisma.project.findMany({
    where: { userId: session?.user?.id },
    orderBy: { updatedAt: "desc" },
    take: 6,
  });

  return (
    <main className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="mt-2 text-slate-600">
          Improve your academic writing with structured feedback and integrity-first guidance.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard/projects"
            className="inline-block rounded-md border border-slate-300 bg-white px-4 py-2 text-slate-700"
          >
            View All Projects
          </Link>
          <Link
            href="/dashboard/projects/new"
            className="inline-block rounded-md bg-blue-600 px-4 py-2 font-medium text-white"
          >
            Create Thesis Project
          </Link>
        </div>
      </section>

      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create your first thesis project to start receiving structured feedback."
        />
      ) : (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Recent Projects</h2>
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
        </section>
      )}
    </main>
  );
}
