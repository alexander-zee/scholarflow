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
    <main className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Thesis Projects</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage your research projects and section reviews.
          </p>
        </div>
        <Link href="/dashboard/projects/new" className="rounded-md bg-blue-600 px-4 py-2 text-white">
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
