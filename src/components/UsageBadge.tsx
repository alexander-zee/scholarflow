type UsageBadgeProps = {
  used: number;
  limit: number;
};

export default function UsageBadge({ used, limit }: UsageBadgeProps) {
  const remaining = Math.max(limit - used, 0);
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white/90 px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur-sm dark:border-cyan-400/15 dark:bg-white/[0.08] dark:text-slate-100 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <span>AI reviews used: {used}/{limit}</span>
      <span className="font-medium text-slate-500 dark:text-slate-400">({remaining} left)</span>
    </div>
  );
}
