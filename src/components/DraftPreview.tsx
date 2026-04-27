"use client";

import { sanitizeLatexForJsPreview, type DraftFormat } from "@/lib/draft-latex";
import { marked } from "marked";
import { useEffect, useRef, useState } from "react";

const LATEX_JS_CDN = "https://cdn.jsdelivr.net/npm/latex.js@0.12.6/dist/";

async function markdownToHtml(md: string): Promise<string> {
  const raw = await marked.parse(md || "_Empty draft_", { async: true });
  return typeof raw === "string" ? raw : String(raw);
}

type Props = {
  source: string;
  format: DraftFormat;
  className?: string;
};

/**
 * Renders LaTeX.js HTML for LaTeX drafts, or Marked HTML for legacy markdown.
 * True Overleaf-style WYSIWYG editing would need a different architecture; this is read-mostly preview alongside source.
 */
export default function DraftPreview({ source, format, className = "" }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const stylesHostRef = useRef<HTMLDivElement>(null);
  const stylesInjected = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    body.innerHTML = "";
    setError(null);

    if (format === "markdown") {
      stylesInjected.current = false;
      if (stylesHostRef.current) stylesHostRef.current.innerHTML = "";
      let cancelled = false;
      void (async () => {
        try {
          const html = await markdownToHtml(source);
          if (!cancelled) body.innerHTML = html;
        } catch {
          if (!cancelled) body.textContent = source;
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;
    void (async () => {
      try {
        const { parse, HtmlGenerator } = await import("latex.js");
        if (cancelled || !body) return;
        const gen = new HtmlGenerator({ hyphenate: false });
        const safe = sanitizeLatexForJsPreview(source.trim() || "\\textit{(empty draft)}");
        const generator = parse(safe, { generator: gen });
        const frag = generator.domFragment();
        if (cancelled) return;
        if (!stylesInjected.current && stylesHostRef.current) {
          stylesHostRef.current.innerHTML = "";
          stylesHostRef.current.appendChild(generator.stylesAndScripts(LATEX_JS_CDN));
          stylesInjected.current = true;
        }
        body.appendChild(frag);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "LaTeX preview failed";
        setError(msg);
        try {
          body.innerHTML = await markdownToHtml(
            "```latex\n" + source.slice(0, 200_000) + "\n```",
          );
        } catch {
          body.textContent = source;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [source, format]);

  return (
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${className}`}>
      {error ? (
        <p className="mb-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
          LaTeX preview could not render every command ({error}). Showing a fenced fallback; edit the source on the left.
        </p>
      ) : null}
      <div ref={stylesHostRef} />
      <div
        ref={bodyRef}
        className="draft-preview-body min-h-[32vh] flex-1 overflow-auto rounded-lg border border-slate-200 bg-white p-4 text-slate-900 shadow-inner [&_.page]:bg-white"
      />
    </div>
  );
}
