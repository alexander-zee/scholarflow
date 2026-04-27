import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteProjectAction } from "@/actions/project-actions";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import ReferenceOutlinePanel from "@/components/ReferenceOutlinePanel";
import SupportChatBubble from "@/components/SupportChatBubble";

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
      <main className="relative left-1/2 right-1/2 flex h-[calc(100dvh-2.75rem)] min-h-0 w-screen -translate-x-1/2 flex-col overflow-hidden">
        <div className="absolute inset-0 -z-20 bg-gradient-to-b from-[#f4f8ff] via-white to-[#f8fbff]" />
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute left-[2%] top-[8%] h-[26rem] w-[26rem] rounded-full bg-sky-300/40 blur-[135px]" />
          <div className="absolute right-[4%] top-[14%] h-[28rem] w-[28rem] rounded-full bg-blue-300/40 blur-[145px]" />
          <div className="absolute left-[32%] top-[34%] h-80 w-80 rounded-full bg-cyan-300/30 blur-[120px]" />
          <div className="absolute right-[24%] top-[52%] h-72 w-72 rounded-full bg-sky-200/30 blur-[110px]" />
          <div className="absolute left-[46%] top-[18%] h-64 w-64 rounded-full bg-blue-200/25 blur-[105px]" />
        </div>
        <div className="absolute inset-x-0 bottom-0 -z-10 h-[238px] bg-[#090f1f]" />
        <section className="mx-auto flex w-full max-w-[1500px] flex-1 min-h-0 flex-col px-4 pb-3 pt-2">
          <div className="mb-3 rounded-xl border border-slate-200/80 bg-white p-2 shadow-[0_8px_22px_rgba(15,23,42,0.05)]">
            <div className="flex flex-wrap items-center gap-1.5">
              <Link
                href={`/dashboard/projects/${id}/review`}
                className="rounded-md bg-[#1e9ee0] px-3 py-1.5 text-[11px] font-semibold text-white"
              >
                Open Writing Studio
              </Link>
              <Link href={`/dashboard/projects/${id}/history`} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-700">
                Feedback history
              </Link>
              <a href={`/api/projects/${id}/export?format=pdf`} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-700">
                Export PDF
              </a>
              <a href={`/api/projects/${id}/export?format=txt`} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-700">
                Export TXT
              </a>
              <a href={`/api/projects/${id}/export?format=md`} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-700">
                Export MD
              </a>
              <a href={`/api/projects/${id}/export?format=tex`} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-700">
                Export LaTeX
              </a>
              <Link href={`/dashboard/projects/${id}/print`} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-700">
                Print
              </Link>
              <div className="ml-auto flex items-center gap-2 pr-1 text-[10px] text-slate-400">
                <span className="truncate font-medium text-slate-700">{project.title}</span>
                <span>•</span>
                <span>{project.language}</span>
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded-2xl bg-transparent p-4">
            <ReferenceOutlinePanel projectId={id} references={referenceRows} hasOutline={hasOutline} />
          </div>
        </section>
        <footer className="sf-landing-bleed sf-footer-bleed relative mt-1 h-[208px] shrink-0 border-t border-slate-900/20 bg-[#090f1f] px-6 text-slate-300">
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
      <SupportChatBubble side="right" />
    </>
  );
}
