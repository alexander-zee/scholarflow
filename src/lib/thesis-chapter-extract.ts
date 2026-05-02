/**
 * Safe unwrap + staged normalization for LLM thesis chapter blobs (fences, JSON wrappers,
 * full LaTeX documents, preamble trimming).
 */

import { sanitizeThesisLatexMath } from "@/lib/latex-math-sanitize";
import type { SanitizeBlankCitationsOptions } from "@/lib/thesis-citation-sanitize";
import { sanitizeBlankCitationsInLatex } from "@/lib/thesis-citation-sanitize";
import { auditChapterBody } from "@/lib/thesis-quality-audit";
import { auditTextForPlaceholderLeaks } from "@/lib/thesis-placeholder-audit";
import type { ThesisChapterKind } from "@/lib/thesis-prompt-standards";

export type UnwrapChapterLatexOptions = {
  /** When true, drop preamble before the first thesis \\section (prefers \\section{Introduction}). Default false for generic blobs (e.g. abstract snippets). */
  sliceFromPrimarySection?: boolean;
};

function preview1000(s: string): string {
  return s.slice(0, 1000);
}

/** Largest fenced ``` ... ``` block (language tag optional). */
export function extractLargestMarkdownCodeFence(input: string): string | null {
  const re = /```(?:[a-zA-Z0-9_-]*)\s*\r?\n?([\s\S]*?)```/g;
  let best = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    const inner = (m[1] ?? "").trim();
    if (inner.length > best.length) best = inner;
  }
  return best.length ? best : null;
}

export function tryExtractStringFieldsFromJson(raw: string): string | null {
  const t = raw.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return null;
  try {
    const parsed: unknown = JSON.parse(t);
    const pickFromObject = (o: Record<string, unknown>): string => {
      let best = "";
      for (const k of ["latex", "chapter", "content", "text"]) {
        const v = o[k];
        if (typeof v === "string") {
          const tt = v.trim();
          if (tt.length > best.length) best = tt;
        }
      }
      return best;
    };
    if (Array.isArray(parsed)) {
      let best = "";
      for (const el of parsed) {
        if (el && typeof el === "object" && !Array.isArray(el)) {
          const inner = pickFromObject(el as Record<string, unknown>);
          if (inner.length > best.length) best = inner;
        }
      }
      return best.length ? best : null;
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const s = pickFromObject(parsed as Record<string, unknown>);
      return s.length ? s : null;
    }
  } catch {
    return null;
  }
  return null;
}

export function extractLatexDocumentBody(s: string): string {
  const begin = /\\begin\s*\{\s*document\s*\}/i;
  const end = /\\end\s*\{\s*document\s*\}/i;
  const mb = begin.exec(s);
  const me = end.exec(s);
  if (mb && me && me.index > mb.index) {
    return s.slice(mb.index + mb[0].length, me.index).trim();
  }
  return s;
}

/** Prefer Introduction; otherwise slice from first \\section heading. */
export function sliceFromFirstChapterSection(s: string): string {
  const intro = "\\section{Introduction}";
  const idxIntro = s.indexOf(intro);
  if (idxIntro >= 0) return s.slice(idxIntro).trim();
  const m = /\\section\*?\{/.exec(s);
  if (m && m.index >= 0) return s.slice(m.index).trim();
  return s.trim();
}

/**
 * JSON wrapper → largest markdown fence → document body → optional section slice.
 */
export function unwrapChapterLatexCandidate(
  raw: string,
  opts?: UnwrapChapterLatexOptions,
): { text: string; notes: string[] } {
  const notes: string[] = [];
  let s = raw.trim();
  if (!s) return { text: "", notes };

  const jsonInner = tryExtractStringFieldsFromJson(s);
  if (jsonInner) {
    s = jsonInner.trim();
    notes.push("unwrap_json_field");
  }

  const fenced = extractLargestMarkdownCodeFence(s);
  if (fenced) {
    const outerSansFenceLen = s.replace(/```[\s\S]*?```/g, "").trim().length;
    const fenceDominates = fenced.length >= outerSansFenceLen || fenced.length >= Math.min(s.length, 200);
    if (fenceDominates || /```/.test(raw)) {
      s = fenced;
      notes.push("unwrap_markdown_fence_largest");
    }
  }

  const docStripped = extractLatexDocumentBody(s);
  if (docStripped !== s) {
    s = docStripped;
    notes.push("unwrap_latex_document_body");
  }

  if (opts?.sliceFromPrimarySection) {
    const sliced = sliceFromFirstChapterSection(s);
    if (sliced !== s.trim()) {
      s = sliced;
      notes.push("unwrap_slice_from_section");
    }
  }

  return { text: s.trim(), notes };
}

/** Figure~(without \\ref), stray backticks, common citation placeholders; does not run math sanitize. */
export function stripResidualMarkdownLatexArtifacts(input: string): string {
  return input
    .replace(/```[a-zA-Z0-9_-]*/gi, "")
    .replace(/```/g, "")
    .replace(/\(author\?\)/gi, "")
    .replace(/Figure~(?!\\ref\{)/g, "Figure ")
    .trim();
}

export type ChapterBodyPipelineDiagnostics = {
  unwrapNotes: string[];
  rawApiChars: number;
  rawApiPreview1000: string;
  afterUnwrapChars: number;
  afterUnwrapPreview1000: string;
  afterResidualMarkdownChars: number;
  afterResidualMarkdownPreview1000: string;
  afterLatexSanitizeChars: number;
  afterLatexSanitizePreview1000: string;
  afterCitationSanitizeChars: number;
  afterCitationSanitizePreview1000: string;
  afterPlaceholderAuditChars: number;
  placeholderLeakHitCount: number;
  placeholderLeakCodes: string[];
  fillerAuditIssueCodes: string[];
  /** Present when later stages (outside this helper) update length. */
  afterStructureRepairChars?: number;
  finalAcceptedChars?: number;
  rejectionReason?: string;
  emptiedAtStage?: string;
  lastNonEmptyStage?: string;
  lastNonEmptyLength?: number;
  lastNonEmptyPreview1000?: string;
  recoveryApplied?: boolean;
  recoveryStrategy?: string;
};

function bumpNonEmpty(
  diag: ChapterBodyPipelineDiagnostics,
  stage: string,
  len: number,
  previewSrc: string,
): void {
  if (len > 0) {
    diag.lastNonEmptyStage = stage;
    diag.lastNonEmptyLength = len;
    diag.lastNonEmptyPreview1000 = preview1000(previewSrc);
  }
}

function observeShrink(diag: ChapterBodyPipelineDiagnostics, stage: string, prevLen: number, nextLen: number, prevText: string): void {
  if (prevLen > 0 && nextLen === 0) {
    diag.emptiedAtStage = stage;
    diag.lastNonEmptyStage = diag.lastNonEmptyStage ?? "unknown";
    diag.lastNonEmptyPreview1000 = diag.lastNonEmptyPreview1000 ?? preview1000(prevText);
  }
}

/** Minimal path when the full pipeline zeroes content but raw was non-empty. */
export function recoverChapterBodyMinimal(rawFromApi: string, citationOpts?: SanitizeBlankCitationsOptions): string {
  const unwrapped = unwrapChapterLatexCandidate(rawFromApi, { sliceFromPrimarySection: true });
  let s = stripResidualMarkdownLatexArtifacts(unwrapped.text);
  s = sanitizeBlankCitationsInLatex(s, citationOpts).text.trim();
  return s;
}

export function processChapterBodyFromModelRaw(args: {
  rawFromApi: string;
  chapterKind: ThesisChapterKind;
  citationOpts?: SanitizeBlankCitationsOptions;
  chapterOrderIndex: number;
  chapterTitle: string;
  technicalPipeline: boolean;
  highQualityThesis: boolean;
  allowedNatbibKeys: string[];
}): { text: string; diagnostics: ChapterBodyPipelineDiagnostics } {
  const rawApi = args.rawFromApi;
  const diag: ChapterBodyPipelineDiagnostics = {
    unwrapNotes: [],
    rawApiChars: rawApi.length,
    rawApiPreview1000: preview1000(rawApi),
    afterUnwrapChars: 0,
    afterUnwrapPreview1000: "",
    afterResidualMarkdownChars: 0,
    afterResidualMarkdownPreview1000: "",
    afterLatexSanitizeChars: 0,
    afterLatexSanitizePreview1000: "",
    afterCitationSanitizeChars: 0,
    afterCitationSanitizePreview1000: "",
    afterPlaceholderAuditChars: 0,
    placeholderLeakHitCount: 0,
    placeholderLeakCodes: [],
    fillerAuditIssueCodes: [],
  };

  const unwrap = unwrapChapterLatexCandidate(rawApi, { sliceFromPrimarySection: true });
  diag.unwrapNotes = unwrap.notes;
  let s = unwrap.text;
  diag.afterUnwrapChars = s.length;
  diag.afterUnwrapPreview1000 = preview1000(s);
  bumpNonEmpty(diag, "after_unwrap", s.length, s);

  let prev = s;
  s = stripResidualMarkdownLatexArtifacts(s);
  observeShrink(diag, "after_residual_markdown", prev.length, s.length, prev);
  diag.afterResidualMarkdownChars = s.length;
  diag.afterResidualMarkdownPreview1000 = preview1000(s);
  bumpNonEmpty(diag, "after_residual_markdown", s.length, s);

  prev = s;
  s = sanitizeThesisLatexMath(s);
  observeShrink(diag, "after_latex_sanitize", prev.length, s.length, prev);
  diag.afterLatexSanitizeChars = s.length;
  diag.afterLatexSanitizePreview1000 = preview1000(s);
  bumpNonEmpty(diag, "after_latex_sanitize", s.length, s);

  prev = s;
  s = sanitizeBlankCitationsInLatex(s, args.citationOpts).text.trim();
  observeShrink(diag, "after_citation_sanitize", prev.length, s.length, prev);
  diag.afterCitationSanitizeChars = s.length;
  diag.afterCitationSanitizePreview1000 = preview1000(s);
  bumpNonEmpty(diag, "after_citation_sanitize", s.length, s);

  diag.afterPlaceholderAuditChars = s.length;
  const phHits = auditTextForPlaceholderLeaks(s);
  diag.placeholderLeakHitCount = phHits.length;
  diag.placeholderLeakCodes = phHits.slice(0, 12).map((h) => h.code);

  const fillerIssues = auditChapterBody(s, args.chapterKind, {
    chapterOrderIndex: args.chapterOrderIndex,
    chapterTitle: args.chapterTitle,
    technicalPipeline: args.technicalPipeline,
    highQualityThesis: args.highQualityThesis,
    allowedNatbibKeys: args.allowedNatbibKeys,
  });
  diag.fillerAuditIssueCodes = fillerIssues.slice(0, 20).map((i) => i.code);

  if (!s.trim() && rawApi.trim().length > 0) {
    const recovered = recoverChapterBodyMinimal(rawApi, args.citationOpts);
    if (recovered.length > 0) {
      diag.recoveryApplied = true;
      diag.recoveryStrategy = "minimal_recover_unwrap_residual_citation_only";
      s = recovered;
      diag.rejectionReason = diag.rejectionReason ?? "primary_pipeline_zeroed_used_recovery";
      diag.afterPlaceholderAuditChars = s.length;
      bumpNonEmpty(diag, "after_recovery", s.length, s);
    } else {
      diag.rejectionReason = diag.rejectionReason ?? "pipeline_and_recovery_empty";
      diag.emptiedAtStage = diag.emptiedAtStage ?? "after_full_pipeline";
    }
  }

  return { text: s.trim(), diagnostics: diag };
}
