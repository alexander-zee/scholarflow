/** Pass 10-style audit: banned substrings that indicate placeholder leakage or broken refs. */

const BANNED_SUBSTRINGS: { pattern: RegExp; code: string; message: string }[] = [
  { pattern: /this\s+passage\s+develops/i, code: "ban_this_passage_develops", message: 'Remove meta scaffold phrasing ("This passage develops…"). Write substantive argument instead.' },
  { pattern: /this\s+passage\s+addresses/i, code: "ban_this_passage_addresses", message: 'Remove meta scaffold phrasing ("This passage addresses…"). Write substantive argument instead.' },
  { pattern: /this\s+section\s+will\b/i, code: "ban_this_section_will", message: 'Remove forward-reference filler ("This section will…"). Write the content now.' },
  { pattern: /\breplace\s+with\b/i, code: "ban_replace_with", message: "Remove “replace with …” template instructions; supply final wording." },
  { pattern: /(^|\n)\s*SECTION:\s*/i, code: "ban_section_scaffold_label", message: "Remove or convert SECTION: labels into real \\section{...} headings." },
  { pattern: /(^|\n)\s*Subsection:\s*/i, code: "ban_subsection_scaffold_label", message: "Remove or convert Subsection: labels into real \\subsection{...} headings." },
  { pattern: /this\s+subsection\s+is\s+included\s+to\s+preserve/i, code: "ban_structure_preservation_meta", message: "Remove structure-preservation boilerplate; expand with real analysis." },
  { pattern: /\[fill\]|\[coefficient\]|\[sample size\]/i, code: "ban_bracket_fill_stub", message: "Remove bracket fill stubs; use numbers or honest illustrative labels in prose/captions." },
  { pattern: /awawadwd/i, code: "ban_awawadwd", message: "Forbidden placeholder substring detected." },
  { pattern: /\basddd\b/i, code: "ban_asddd", message: "Forbidden placeholder substring detected." },
  { pattern: /\bPlaceholder\s+Figure\b/i, code: "ban_placeholder_figure", message: 'Use "Illustrative" figures with real TikZ/pgfplots, not "Placeholder Figure".' },
  { pattern: /Insert\s+figure\s+here/i, code: "ban_insert_figure", message: "Remove 'Insert figure here' boilerplate." },
  { pattern: /\bnot\s+shown\s+here\b/i, code: "ban_not_shown", message: "Remove 'not shown here' placeholder phrasing." },
  { pattern: /\bauthor\?\b/i, code: "ban_author_q", message: "Remove author? citation placeholders." },
  { pattern: /\blorem(\s+ipsum)?\b/i, code: "ban_lorem", message: "Remove lorem ipsum text." },
  { pattern: /Figure\s+\?\?/i, code: "ban_figure_ref", message: "Unresolved figure reference (??)." },
  { pattern: /Table\s+\?\?/i, code: "ban_table_ref", message: "Unresolved table reference (??)." },
  {
    pattern: /Equation~\s*(?:$|[.,;:])\s*$/m,
    code: "ban_equation_tilde",
    message: "Dangling Equation~ without a \\ref{...} target.",
  },
  {
    pattern: /Figure~(?!\\ref\{)/,
    code: "ban_dangling_figure_tilde",
    message: "Figure~ must always be followed by \\ref{...} (no bare Figure~).",
  },
  {
    pattern: /Table~(?!\\ref\{)/,
    code: "ban_dangling_table_tilde",
    message: "Table~ must always be followed by \\ref{...} (no bare Table~).",
  },
  {
    pattern: /Placeholder\s*[—-]\s*complete|\[Placeholder/i,
    code: "ban_placeholder_reference_phrase",
    message: "Remove placeholder reference phrasing; use real bibliography text or uploaded source keys only.",
  },
];

/** Standalone "research question" as only substantive line (after stripping LaTeX). */
function isStandaloneResearchQuestionLeak(text: string): boolean {
  const plain = text
    .replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?(\{[^}]*\})?/g, " ")
    .replace(/[{}$\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length > 80) return false;
  return /^research\s+question\.?:?\s*$/i.test(plain) || plain.toLowerCase() === "research question";
}

export type PlaceholderAuditHit = { code: string; message: string; sample?: string };

export function auditTextForPlaceholderLeaks(text: string): PlaceholderAuditHit[] {
  const hits: PlaceholderAuditHit[] = [];
  for (const { pattern, code, message } of BANNED_SUBSTRINGS) {
    const m = text.match(pattern);
    if (m) hits.push({ code, message, sample: m[0].slice(0, 80) });
  }
  if (isStandaloneResearchQuestionLeak(text)) {
    hits.push({
      code: "ban_rq_standalone",
      message: "Abstract or body contains only a bare 'research question' line without substance.",
    });
  }
  /** Em-dash padding used as fake transition (three or more in a row) */
  if (/—[^.\n]*—[^.\n]*—/.test(text)) {
    hits.push({
      code: "ban_emdash_padding",
      message: "Reduce repeated em-dash separators used as filler between sections.",
    });
  }
  return hits;
}

export function buildAntiPlaceholderAbstractPrompt(args: { body: string; hits: PlaceholderAuditHit[] }): string {
  return `
Rewrite the thesis Abstract below as valid LaTeX body only (no \\chapter, no preamble).

Remove every placeholder leak and banned fragment. Issues detected:
${args.hits.map((h) => `- [${h.code}] ${h.message}`).join("\n")}

Rules:
- Keep 150–250 words of substantive academic prose.
- No gibberish, no standalone "Research question" lines, no "Figure ??", no lorem ipsum.
- No displayed equations if this is for a technical quantitative thesis abstract policy.

Current abstract LaTeX:
${args.body}
`.trim();
}

export function buildAntiPlaceholderChapterPrompt(args: {
  chapterTitle: string;
  body: string;
  hits: PlaceholderAuditHit[];
}): string {
  return `
You are repairing a thesis chapter LaTeX body to remove placeholder leaks before PDF export.

Chapter title: ${args.chapterTitle}

Detected issues (eliminate all):
${args.hits.map((h) => `- [${h.code}] ${h.message}`).join("\n")}

Rules:
- Return valid LaTeX body only (no preamble; no \\chapter for the main chapter title).
- Preserve structure, headings, and legitimate citations; replace toxic fragments with substantive academic prose.
- Never output "Placeholder Figure", "Insert figure here", keyboard mash, or "Figure ??".

Current LaTeX:
${args.body}
`.trim();
}

export function auditCombinedThesisBodies(args: {
  abstractLatex: string;
  chapters: { title: string; content: string }[];
  includeMetaTitlePage?: boolean;
}): PlaceholderAuditHit[] {
  const hits: PlaceholderAuditHit[] = [];
  hits.push(...auditTextForPlaceholderLeaks(args.abstractLatex));
  for (const ch of args.chapters) {
    hits.push(...auditTextForPlaceholderLeaks(`${ch.title}\n${ch.content}`));
  }
  return hits;
}
