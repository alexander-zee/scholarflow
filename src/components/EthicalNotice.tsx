type EthicalNoticeProps = {
  className?: string;
};

export default function EthicalNotice({ className = "" }: EthicalNoticeProps) {
  return (
    <aside
      className={`rounded-2xl border border-emerald-200/90 bg-emerald-50/95 p-4 text-sm leading-relaxed text-emerald-950 shadow-sm backdrop-blur-sm dark:border-emerald-400/25 dark:bg-emerald-950/40 dark:text-emerald-50 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] dark:backdrop-blur-md ${className}`}
    >
      ThesisPilot is designed to support learning, revision, and academic development.
      It provides feedback and editable suggestions. Users are responsible for checking
      their institution&apos;s academic integrity rules and ensuring that submitted work
      reflects their own understanding, analysis, and authorship.
    </aside>
  );
}
