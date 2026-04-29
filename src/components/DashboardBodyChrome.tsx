"use client";

import { usePathname } from "next/navigation";
import WritingStudioBackdrop from "@/components/WritingStudioBackdrop";
import { isWritingStudioPath } from "@/lib/writing-studio-path";

export default function DashboardBodyChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isWritingStudio = isWritingStudioPath(pathname);

  return (
    <div
      className={
        isWritingStudio
          ? "relative min-h-0 space-y-2 bg-transparent pb-0 dark:bg-transparent"
          : "relative min-h-0 space-y-4 bg-slate-50/90 pb-0 dark:bg-[linear-gradient(165deg,#020617_0%,#0c1e33_38%,#020617_100%)]"
      }
    >
      {isWritingStudio ? <WritingStudioBackdrop /> : null}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
