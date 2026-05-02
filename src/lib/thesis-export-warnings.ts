import type { NextResponse } from "next/server";
import type { BlankCitationHit } from "@/lib/thesis-citation-sanitize";
import type { PlaceholderAuditHit } from "@/lib/thesis-placeholder-audit";
import type { ThesisAuditIssue } from "@/lib/thesis-quality-audit";

export type ScholarFlowExportStatus = "success" | "success_with_warnings" | "failed";

export type ScholarFlowExportWarning = {
  code: string;
  message: string;
};

export const EXPORT_WARNING_PANEL_TITLE = "Export completed with warnings";
export const EXPORT_WARNING_PANEL_INTRO =
  "Your thesis was exported, but some issues need review before submission.";

const GATE_REASON_MESSAGES: Record<string, string> = {
  blank_citation:
    "Some citation commands were empty or invalid. Empty cites were replaced with [citation needed] or a single upload key where applicable — verify in the PDF/LaTeX.",
  placeholder_title: "Project title still looks like a placeholder; update it in project settings before submission.",
  markdown_code_fence: "Markdown code fences were detected in the draft; they should be removed for final LaTeX.",
  author_placeholder: 'Author placeholders like "(author?)" were found — replace with real attribution.',
  dangling_figure_ref: "Unresolved Figure~ references (not followed by \\ref{...}) were adjusted to readable placeholders.",
  intro_missing_subsections: "Introduction may be missing expected \\subsection structure — review headings in the Writing Studio.",
  too_short: "Draft is shorter than the recommended minimum for a thesis export — consider expanding key chapters.",
  insufficient_imported_references:
    "Fewer than five sources include rich imported metadata; bibliography entries may be thin until you add more structured references.",
};

export function warningsFromGateReasons(reasons: string[], blankHits: BlankCitationHit[]): ScholarFlowExportWarning[] {
  const out: ScholarFlowExportWarning[] = [];
  for (const r of reasons) {
    const msg = GATE_REASON_MESSAGES[r];
    if (msg) out.push({ code: `export_gate:${r}`, message: msg });
    else out.push({ code: `export_gate:${r}`, message: `Quality note: ${r.replace(/_/g, " ")}` });
  }
  if (reasons.includes("blank_citation")) {
    for (const h of blankHits.slice(0, 5)) {
      out.push({
        code: "blank_citation_location",
        message: `${h.source}: empty cite near "…${h.context.slice(0, 120)}…"`,
      });
    }
  }
  return out;
}

export function warningsFromPlaceholderHits(hits: PlaceholderAuditHit[]): ScholarFlowExportWarning[] {
  return hits.map((h) => ({
    code: `placeholder:${h.code}`,
    message: h.message,
  }));
}

export function warningsFromAuditIssues(issues: ThesisAuditIssue[], scope: string): ScholarFlowExportWarning[] {
  return issues.map((i) => ({
    code: `audit:${scope}:${i.code}`,
    message: i.detail,
  }));
}

export function warningsFromSanitizeStats(stats: {
  blankCitationReplacements: number;
  danglingFigureRefsFixed: number;
  danglingTableRefsFixed: number;
  citationNeededKeysRemoved: number;
}): ScholarFlowExportWarning[] {
  const w: ScholarFlowExportWarning[] = [];
  if (stats.blankCitationReplacements > 0) {
    w.push({
      code: "sanitized_blank_citations",
      message: `Replaced ${stats.blankCitationReplacements} empty citation command(s) with [citation needed] or an upload key.`,
    });
  }
  if (stats.danglingFigureRefsFixed > 0) {
    w.push({
      code: "sanitized_figure_refs",
      message: `Adjusted ${stats.danglingFigureRefsFixed} unresolved Figure~ reference(s) to “Figure [check reference]”.`,
    });
  }
  if (stats.danglingTableRefsFixed > 0) {
    w.push({
      code: "sanitized_table_refs",
      message: `Adjusted ${stats.danglingTableRefsFixed} unresolved Table~ reference(s) to “Table [check reference]”.`,
    });
  }
  if (stats.citationNeededKeysRemoved > 0) {
    w.push({
      code: "sanitized_citation_needed_key",
      message: `Replaced ${stats.citationNeededKeysRemoved} \\cite…{citation_needed} with plain [citation needed].`,
    });
  }
  return w;
}

export function mergeAndDedupeWarnings(...groups: ScholarFlowExportWarning[][]): ScholarFlowExportWarning[] {
  const seen = new Set<string>();
  const out: ScholarFlowExportWarning[] = [];
  for (const g of groups) {
    for (const w of g) {
      const key = `${w.code}|${w.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(w);
    }
  }
  return out;
}

const MAX_WARNINGS_IN_HEADER = 14;
const MAX_WARNING_MESSAGE_CHARS = 200;
const MAX_HEADER_JSON_BYTES = 6500;

export function encodeExportWarningsPayload(warnings: ScholarFlowExportWarning[]): string {
  const slim = warnings.slice(0, MAX_WARNINGS_IN_HEADER).map((w) => ({
    code: w.code.length > 96 ? `${w.code.slice(0, 96)}…` : w.code,
    message:
      w.message.length > MAX_WARNING_MESSAGE_CHARS
        ? `${w.message.slice(0, MAX_WARNING_MESSAGE_CHARS)}…`
        : w.message,
  }));
  let payload = {
    v: 1 as const,
    title: EXPORT_WARNING_PANEL_TITLE,
    intro: EXPORT_WARNING_PANEL_INTRO,
    warnings: slim,
  };
  let json = JSON.stringify(payload);
  while (Buffer.byteLength(json, "utf8") > MAX_HEADER_JSON_BYTES && payload.warnings.length > 4) {
    payload = {
      ...payload,
      warnings: payload.warnings.slice(0, Math.max(4, Math.floor(payload.warnings.length / 2))),
    };
    json = JSON.stringify(payload);
  }
  return Buffer.from(json, "utf8").toString("base64");
}

export function attachExportWarningHeaders(res: NextResponse, warnings: ScholarFlowExportWarning[]): NextResponse {
  const status: ScholarFlowExportStatus = warnings.length > 0 ? "success_with_warnings" : "success";
  res.headers.set("X-ScholarFlow-Export-Status", status);
  if (warnings.length > 0) {
    try {
      const b64 = encodeExportWarningsPayload(warnings);
      if (b64.length > 12_000) {
        console.warn("[export-warnings] payload still large after trim; omitting B64 header", { b64Length: b64.length });
      } else {
        res.headers.set("X-ScholarFlow-Export-Warnings-B64", b64);
      }
    } catch (e) {
      console.warn("[export-warnings] failed to attach warning header", e);
    }
  }
  return res;
}
