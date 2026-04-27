import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import PrintActions from "@/components/print/PrintActions";

export default async function ProjectPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) notFound();

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      documentSections: {
        where: { sectionType: { in: ["draft_chapter", "outline_suggested", "outline_summary"] } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!project || project.userId !== session.user.id) notFound();

  const draftSections = project.documentSections.filter((s) => s.sectionType === "draft_chapter");
  const sections = draftSections.length > 0 ? draftSections : project.documentSections;

  return (
    <main className="mx-auto w-full max-w-4xl bg-white p-8 text-slate-900">
      <PrintActions />
      <h1 className="text-3xl font-bold">{project.title}</h1>
      <p className="mt-1 text-sm text-slate-600">
        {project.field} - {project.degreeLevel} - {project.language}
      </p>
      <p className="mt-4 text-sm">
        <span className="font-semibold">Research question:</span> {project.researchQuestion}
      </p>
      <hr className="my-6 border-slate-200" />

      {sections.length === 0 ? (
        <p className="text-sm text-slate-600">No draft sections available yet.</p>
      ) : (
        <div className="space-y-8">
          {sections.map((section) => (
            <section key={section.id}>
              <h2 className="text-xl font-semibold">{section.title}</h2>
              <p className="mb-3 text-xs uppercase tracking-wide text-slate-500">{section.sectionType}</p>
              <pre className="whitespace-pre-wrap font-sans text-[15px] leading-7 text-slate-800">
                {section.content}
              </pre>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
