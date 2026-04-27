type EthicalNoticeProps = {
  className?: string;
};

export default function EthicalNotice({ className = "" }: EthicalNoticeProps) {
  return (
    <aside
      className={`rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-800/80 dark:bg-emerald-950/50 dark:text-emerald-100 ${className}`}
    >
      ScholarFlow is designed to support learning, revision, and academic development.
      It provides feedback and editable suggestions. Users are responsible for checking
      their institution&apos;s academic integrity rules and ensuring that submitted work
      reflects their own understanding, analysis, and authorship.
    </aside>
  );
}
