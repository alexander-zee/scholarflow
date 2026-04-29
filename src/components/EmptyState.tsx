type EmptyStateProps = {
  title: string;
  description: string;
};

export default function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300/90 bg-white/70 p-8 text-center shadow-sm backdrop-blur-sm dark:border-white/15 dark:bg-slate-950/40 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{description}</p>
    </div>
  );
}
