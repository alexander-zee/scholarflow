type UsageBadgeProps = {
  used: number;
  limit: number;
};

export default function UsageBadge({ used, limit }: UsageBadgeProps) {
  const remaining = Math.max(limit - used, 0);
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
      <span>AI reviews used: {used}/{limit}</span>
      <span className="text-slate-500">({remaining} left)</span>
    </div>
  );
}
