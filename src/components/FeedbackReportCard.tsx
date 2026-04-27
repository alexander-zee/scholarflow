type FeedbackReportCardProps = {
  summary: string;
  overallScore: number;
  createdAt: string;
};

export default function FeedbackReportCard({
  summary,
  overallScore,
  createdAt,
}: FeedbackReportCardProps) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-slate-900">Feedback report</h4>
        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
          Score {overallScore}
        </span>
      </div>
      <p className="mt-3 text-sm text-slate-700">{summary}</p>
      <p className="mt-2 text-xs text-slate-500">{createdAt}</p>
    </article>
  );
}
