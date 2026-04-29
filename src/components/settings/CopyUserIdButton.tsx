"use client";

import { useCallback, useState } from "react";

export default function CopyUserIdButton({ userId }: { userId: string }) {
  const [label, setLabel] = useState("Copy");

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(userId);
      setLabel("Copied");
      window.setTimeout(() => setLabel("Copy"), 1600);
    } catch {
      setLabel("Failed");
      window.setTimeout(() => setLabel("Copy"), 1600);
    }
  }, [userId]);

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-cyan-200/90 transition hover:border-cyan-400/40 hover:bg-cyan-500/15 hover:text-white"
    >
      {label}
    </button>
  );
}
