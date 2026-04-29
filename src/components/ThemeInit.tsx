"use client";

import { useLayoutEffect } from "react";

/**
 * Applies persisted theme without inline <script> tags in layout.
 * Next 16 + Turbopack warns on script tags rendered from React components.
 */
export default function ThemeInit() {
  useLayoutEffect(() => {
    try {
      const t = localStorage.getItem("sf-theme");
      document.documentElement.classList.toggle("dark", t === "dark");
    } catch {
      // ignore storage access errors
    }
  }, []);

  return null;
}
