"use client";

import { signOut } from "next-auth/react";

export default function SettingsSignOutButton() {
  return (
    <button
      type="button"
      onClick={() => void signOut({ callbackUrl: "/" })}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/60 bg-rose-500/5 px-4 py-3 text-sm font-semibold text-rose-200 transition hover:border-rose-400 hover:bg-rose-500/10 hover:text-rose-50"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Log out
    </button>
  );
}
