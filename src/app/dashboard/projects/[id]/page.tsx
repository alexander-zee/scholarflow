import { notFound } from "next/navigation";
import { deleteProjectAction } from "@/actions/project-actions";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import ReferenceOutlinePanel from "@/components/ReferenceOutlinePanel";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      documentSections: { orderBy: { updatedAt: "desc" } },
      referencePapers: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!project || project.userId !== session?.user?.id) {
    notFound();
  }

  const deleteProject = deleteProjectAction.bind(null, id);

  const referenceRows = project.referencePapers.map((paper) => ({
    id: paper.id,
    originalName: paper.originalName,
    mimeType: paper.mimeType,
    sizeBytes: paper.sizeBytes,
    createdAt: paper.createdAt.toISOString(),
    textPreview: paper.extractedText.replace(/\s+/g, " ").trim(),
  }));
  const hasOutline = project.documentSections.some((section) => section.sectionType === "outline_suggested");

  return (
    <>
      <main className="relative left-1/2 right-1/2 flex min-h-[calc(100dvh-2.75rem)] w-screen -translate-x-1/2 flex-col overflow-x-hidden">
        <div className="absolute inset-0 -z-20 bg-gradient-to-b from-[#f4f8ff] via-white to-[#f8fbff] dark:bg-[linear-gradient(180deg,#020617_0%,#0a1628_42%,#030712_100%)]" />
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute left-[1%] top-[6%] h-[30rem] w-[30rem] rounded-full bg-sky-300/50 blur-[150px] dark:bg-cyan-500/[0.18]" />
          <div className="absolute right-[2%] top-[12%] h-[30rem] w-[30rem] rounded-full bg-blue-300/50 blur-[155px] dark:bg-sky-600/[0.14]" />
          <div className="absolute left-[30%] top-[30%] h-[22rem] w-[22rem] rounded-full bg-cyan-300/35 blur-[128px] dark:bg-cyan-400/[0.12]" />
          <div className="absolute right-[20%] top-[50%] h-80 w-80 rounded-full bg-sky-200/35 blur-[120px] dark:bg-blue-600/[0.1]" />
          <div className="absolute left-[46%] top-[16%] h-72 w-72 rounded-full bg-blue-200/30 blur-[112px] dark:bg-sky-500/[0.1]" />
        </div>
        <div className="absolute inset-x-0 bottom-0 -z-10 h-[238px] bg-[#090f1f] dark:bg-gradient-to-t dark:from-[#090f1f] dark:via-[#060b14]/90 dark:to-transparent" />
        <section className="mx-auto flex w-full max-w-[1500px] flex-1 min-h-[calc(100dvh-2.75rem)] flex-col px-4 pb-10 pt-6 md:pt-10">
          <div className="min-h-0 flex-1 overflow-hidden rounded-2xl bg-transparent p-4 md:p-5">
            <ReferenceOutlinePanel
              projectId={id}
              projectTitle={project.title}
              projectLanguage={project.language}
              references={referenceRows}
              hasOutline={hasOutline}
            />
          </div>
        </section>
        <div className="h-[36vh] shrink-0" aria-hidden />
        <footer className="sf-landing-bleed sf-footer-bleed relative mt-1 h-[208px] shrink-0 border-t border-slate-900/20 bg-[#090f1f] px-6 text-slate-300 dark:border-white/10">
          <div className="mx-auto flex h-full w-full max-w-[1780px] flex-col justify-center gap-4">
            <div className="flex items-center gap-10 text-[10px] uppercase tracking-[0.16em] text-slate-300/90 md:text-xs">
              <span>Examples</span>
              <span>Pricing</span>
              <span>Team</span>
              <span>Blog</span>
              <span>Terms &amp; Policies</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <p className="text-base font-semibold tracking-[0.22em] text-slate-200">SCHOLARFLOW</p>
              <p>Research drafting powered by AI supervision</p>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}
