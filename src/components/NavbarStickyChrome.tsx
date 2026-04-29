"use client";

import { usePathname } from "next/navigation";
import { isTransparentMarketingHeader } from "@/lib/writing-studio-path";

/**
 * On the marketing home page and writing studio, removes the global navbar’s
 * white top fade so diffuse backgrounds read continuously behind the header.
 */
export default function NavbarStickyChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const transparent = isTransparentMarketingHeader(pathname);

  return (
    <header
      className={
        transparent
          ? "sticky top-0 z-50 bg-transparent px-3 pb-2 pt-4 md:px-4 md:pt-5"
          : "sticky top-0 z-50 bg-gradient-to-b from-white/50 via-white/28 to-transparent px-3 pb-2 pt-4 dark:from-transparent dark:via-transparent dark:to-transparent md:px-4 md:pt-5"
      }
    >
      {children}
    </header>
  );
}
