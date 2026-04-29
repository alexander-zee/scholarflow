"use client";

import { usePathname } from "next/navigation";
import UsageBadge from "@/components/UsageBadge";

/** Hides the usage strip on the writing studio (full-height editor) route. */
export default function ConditionalUsageBadge({ used, limit }: { used: number; limit: number }) {
  const pathname = usePathname();
  if (pathname?.endsWith("/review")) return null;
  return <UsageBadge used={used} limit={limit} />;
}
