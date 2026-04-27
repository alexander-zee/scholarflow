import { format } from "date-fns";
import { notFound } from "next/navigation";
import FeedbackReportCard from "@/components/FeedbackReportCard";
import EmptyState from "@/components/EmptyState";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function ProjectHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.userId !== session?.user?.id) notFound();

  const reports = await prisma.feedbackReport.findMany({
    where: { projectId: id, userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-bold text-slate-900">Feedback history</h1>
        <p className="mt-1 text-sm text-slate-600">Past AI feedback reports for this project.</p>
      </section>
      {reports.length === 0 ? (
        <EmptyState
          title="No feedback reports yet"
          description="Request your first AI review to build a feedback timeline."
        />
      ) : (
        <div className="space-y-3">
          {reports.map((report) => {
            const reportJson =
              typeof report.reportJson === "object" && report.reportJson !== null
                ? (report.reportJson as Record<string, unknown>)
                : {};
            return (
              <FeedbackReportCard
                key={report.id}
                summary={report.summary}
                overallScore={Number(reportJson.overall_score ?? 0)}
                createdAt={format(report.createdAt, "PPP p")}
              />
            );
          })}
        </div>
      )}
    </main>
  );
}
