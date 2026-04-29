import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Navbar from "@/components/Navbar";
import ThemeInit from "@/components/ThemeInit";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ThesisPilot — Thesis workspace & AI supervisor",
  description:
    "Reference-first thesis workspace: upload papers, generate outlines and draft scaffolding, then revise in a writing studio with supervisor-style feedback, anchored comments, and integrity-first guardrails.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full bg-[#f8fbff] antialiased`}>
      <body suppressHydrationWarning className="min-h-full overflow-x-hidden bg-[#f8fbff] text-slate-900 dark:text-slate-100">
        <ThemeInit />
        <Navbar />
        {/* pb-0 avoids a patterned strip below full-bleed footers on the home page */}
        <div className="mx-auto w-full max-w-[2200px] px-3 pb-0 pt-0 md:px-4">{children}</div>
      </body>
    </html>
  );
}
