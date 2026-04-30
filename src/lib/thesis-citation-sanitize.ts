/**
 * Detect and remove blank / degenerate LaTeX citation commands so export and PDF never see \\cite{} etc.
 */

/** Natbib + common biblatex commands; longer names first so `\\cite` does not swallow `\\citep`. */
const CITE_COMMAND_NAMES =
  "citep|citet|citealt|citeauthor|citeyearpar|parencite|textcite|autocite|footcite|footcitetext|smartcite|natcite|supercite|cite";

const CITE_BODY_RE = new RegExp(
  `\\\\(${CITE_COMMAND_NAMES})\\*?\\s*(?:\\[[^\\]]*\\]\\s*){0,2}\\{([^}]*)\\}`,
  "g",
);

export function isDegenerateCiteArgument(arg: string): boolean {
  const inner = arg.replace(/\s+/g, " ").trim();
  if (inner.length === 0) return true;
  return inner.split(/,/g).every((p) => !p.trim());
}

export type BlankCitationHit = {
  pattern: string;
  source: string;
  /** 0-based chapter index when source is a chapter title */
  chapterIndex?: number;
  match: string;
  context: string;
};

/** ~300 characters centered on the match for debugging. */
function contextAround(text: string, start: number, end: number, total = 300): string {
  const mid = (start + end) / 2;
  const half = total / 2;
  const a = Math.max(0, Math.floor(mid - half));
  const b = Math.min(text.length, Math.ceil(mid + half));
  return text.slice(a, b).replace(/\s+/g, " ").trim();
}

/** Find blank citation commands in one LaTeX string (no mutation). */
export function findBlankCitationHitsInText(body: string, sourceLabel: string, chapterIndex?: number): BlankCitationHit[] {
  const hits: BlankCitationHit[] = [];
  const re = new RegExp(CITE_BODY_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const arg = m[2] ?? "";
    if (!isDegenerateCiteArgument(arg)) continue;
    const full = m[0];
    hits.push({
      pattern: `\\\\${m[1]}{…}`,
      source: sourceLabel,
      chapterIndex,
      match: full.length > 120 ? `${full.slice(0, 117)}…` : full,
      context: contextAround(body, m.index, m.index + full.length, 150),
    });
  }
  return hits;
}

export function findBlankCitationHitsInCorpus(args: {
  abstractLatex: string | null | undefined;
  chapters: { title: string; content: string }[];
}): BlankCitationHit[] {
  const out: BlankCitationHit[] = [];
  const abs = args.abstractLatex?.trim();
  if (abs) out.push(...findBlankCitationHitsInText(abs, "Abstract"));
  args.chapters.forEach((ch, i) => {
    out.push(...findBlankCitationHitsInText(ch.content, ch.title || `Chapter ${i + 1}`, i));
  });
  return out;
}

const REPLACEMENT = "[citation needed]";

export type SanitizeBlankCitationsOptions = {
  /** When exactly one key is present, map empty cites to `\\citep{thatKey}` instead of plain text. */
  uploadFallbackKeys?: string[];
};

function replacementForBlank(opts?: SanitizeBlankCitationsOptions): string {
  const keys = opts?.uploadFallbackKeys?.filter(Boolean) ?? [];
  if (keys.length === 1) return `\\citep{${keys[0]}}`;
  return REPLACEMENT;
}

/**
 * Replace blank citation commands with visible plain text or a single-upload \\citep when configured.
 * Valid citations (non-empty brace arguments) are unchanged.
 */
export function sanitizeBlankCitationsInLatex(
  input: string,
  opts?: SanitizeBlankCitationsOptions,
): { text: string; replacementCount: number } {
  let replacementCount = 0;
  const re = new RegExp(CITE_BODY_RE.source, "g");
  const repl = replacementForBlank(opts);
  const text = input.replace(re, (full, _cmd: string, arg: string) => {
    if (!isDegenerateCiteArgument(arg)) return full;
    replacementCount += 1;
    return repl;
  });
  return { text, replacementCount };
}

export function sanitizeBlankCitationsInChapterDrafts(
  chapters: { title: string; content: string }[],
  opts?: SanitizeBlankCitationsOptions,
): { chapters: { title: string; content: string }[]; totalReplacements: number } {
  let totalReplacements = 0;
  const next = chapters.map((ch) => {
    const { text, replacementCount } = sanitizeBlankCitationsInLatex(ch.content, opts);
    totalReplacements += replacementCount;
    return { ...ch, content: text };
  });
  return { chapters: next, totalReplacements };
}

export function latexHasBlankCitationCommands(body: string): boolean {
  const re = new RegExp(CITE_BODY_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (isDegenerateCiteArgument(m[2] ?? "")) return true;
  }
  return false;
}
