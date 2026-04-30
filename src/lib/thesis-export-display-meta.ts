import {
  isUntrustedProjectTitle,
  isUntrustedResearchQuestion,
  looksLowEntropyTitle,
} from "@/lib/thesis-input-validation";

const FIELD_NONSENSE = /^(x+|test|aaa|asdf|foo|bar|todo|tbd|none\.?|n\/a\.?)$/i;

function isGenericOutlineTitle(t: string) {
  return /^(introduction|literature review|literature|background|overview|preface)$/i.test(t.trim());
}

/** Prefer a substantive chapter title for the cover when the project title is junk. */
export function pickThesisTitleFromChapterTitles(chapters: { title: string }[]): string | null {
  for (const c of chapters) {
    const t = (c.title || "").trim();
    if (!t) continue;
    if (!isGenericOutlineTitle(t)) return t.slice(0, 120);
  }
  const first = chapters[0]?.title?.trim();
  return first ? first.slice(0, 120) : null;
}

export function isUntrustedProjectField(field: string): boolean {
  const f = field.trim();
  if (f.length < 2) return true;
  if (FIELD_NONSENSE.test(f)) return true;
  if (looksLowEntropyTitle(f)) return true;
  return false;
}

export function isUntrustedDegreeLevel(degree: string): boolean {
  const d = degree.trim();
  if (d.length < 2 || d.length > 120) return true;
  if (looksLowEntropyTitle(d)) return true;
  return false;
}

/**
 * Title page / PDF metadata: must not show DB placeholder strings when chapter bodies
 * were generated with inferred prompts (see full-draft route).
 */
export function resolveThesisDisplayMetaForExport(args: {
  projectTitle: string;
  projectField: string;
  degreeLevel: string;
  researchQuestion: string;
  description?: string | null;
  chapterTitles: { title: string }[];
}): {
  title: string;
  field: string;
  degreeLevel: string;
  researchQuestion: string;
} {
  const rawTitle = args.projectTitle.trim();
  const title =
    rawTitle && !isUntrustedProjectTitle(rawTitle)
      ? rawTitle.slice(0, 120)
      : pickThesisTitleFromChapterTitles(args.chapterTitles) || "Academic thesis draft";

  const rawField = args.projectField.trim();
  const field = rawField && !isUntrustedProjectField(rawField) ? rawField.slice(0, 120) : "Academic research";

  const rawDeg = args.degreeLevel.trim();
  const degreeLevel =
    rawDeg && !isUntrustedDegreeLevel(rawDeg) ? rawDeg.slice(0, 120) : "Graduate thesis";

  const rawRq = args.researchQuestion.trim();
  const desc = args.description?.trim() || "";
  const researchQuestion =
    rawRq && !isUntrustedResearchQuestion(rawRq)
      ? rawRq.slice(0, 800)
      : desc.length >= 24
        ? desc.slice(0, 400)
        : "Research question to be finalized by the author.";

  return { title, field, degreeLevel, researchQuestion };
}
