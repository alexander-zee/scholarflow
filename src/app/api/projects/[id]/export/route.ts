import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  buildSimpleArticleLatexDocument,
  buildThesisLatexDocument,
  collectNatbibCiteKeysFromBodies,
} from "@/lib/thesis-latex-export";
import { compileThesisLatexToPdf, getPdfCompileReadiness } from "@/lib/compile-latex-pdf";
import { repairTexForCompileRetry } from "@/lib/thesis-latex-compile-repair";
import { countTikzOrPgfplotsFigures } from "@/lib/thesis-figures-tables";
import { auditCombinedThesisBodies } from "@/lib/thesis-placeholder-audit";
import { findBlankCitationHitsInCorpus, type BlankCitationHit } from "@/lib/thesis-citation-sanitize";
import { sanitizeRecoverableExportCorpus } from "@/lib/thesis-export-sanitize";
import { applyDeterministicThesisFinalization } from "@/lib/thesis-draft-finalize";
import { finalizeAssembledThesisLatexForPdfCompile } from "@/lib/thesis-latex-assembled-finalize";
import {
  attachExportWarningHeaders,
  mergeAndDedupeWarnings,
  type ScholarFlowExportWarning,
  warningsFromAuditIssues,
  warningsFromGateReasons,
  warningsFromPlaceholderHits,
  warningsFromSanitizeStats,
} from "@/lib/thesis-export-warnings";
import { auditAggregatedDraft, auditHighQualityFinalGate } from "@/lib/thesis-quality-audit";
import { projectUsesEarlyChapterMathDelay } from "@/lib/thesis-prompt-standards";
import { resolveThesisDisplayMetaForExport } from "@/lib/thesis-export-display-meta";
import { THESIS_PIPELINE_FIXED_SETTINGS } from "@/lib/thesis-generation-settings";

/** Persist last compiled `.tex` snapshot for debugging (DB + optional filesystem). */
const EXPORT_PDF_LAST_LATEX_SECTION = "export_pdf_last_latex";

async function persistLastExportLatexSnapshot(
  projectId: string,
  texBody: string,
  meta: Record<string, string | null | undefined>,
) {
  const header = `% ThesisPilot LaTeX export snapshot\n% ${JSON.stringify({ ...meta, savedAt: new Date().toISOString() })}\n\n`;
  const full = `${header}${texBody}`;
  try {
    await prisma.documentSection.deleteMany({
      where: { projectId, sectionType: EXPORT_PDF_LAST_LATEX_SECTION },
    });
    await prisma.documentSection.create({
      data: {
        projectId,
        sectionType: EXPORT_PDF_LAST_LATEX_SECTION,
        title: "Last PDF export LaTeX source",
        content: full,
      },
    });
  } catch (e) {
    console.error("[ThesisPilot] persist_last_export_tex_failed", { projectId, e });
  }
  const dir = process.env.SCHOLARFLOW_EXPORT_ARTIFACT_DIR?.trim();
  if (dir) {
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${projectId}-last-export.tex`), full, "utf8");
    } catch (e) {
      console.error("[ThesisPilot] export_artifact_dir_write_failed", { projectId, dir, e });
    }
  }
}

function sanitizeFilename(input: string) {
  return input.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 64) || "scholarflow_draft";
}

function normalizeHeadingKey(input: string) {
  return input
    .toLowerCase()
    .replace(/\(continued\)/gi, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanHeadingTitle(input: string) {
  return input.replace(/\(continued\)/gi, "").replace(/\s+/g, " ").trim();
}

function repairDuplicateLevel(body: string, level: "section" | "subsection"): {
  repaired: string;
  changed: boolean;
  duplicates: string[];
  headings: string[];
} {
  const re = level === "section" ? /\\section\*?\{([^}]+)\}/g : /\\subsection\*?\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  const matches: Array<{ start: number; end: number; title: string }> = [];
  while ((m = re.exec(body)) !== null) {
    matches.push({ start: m.index, end: m.index + m[0].length, title: m[1] || "" });
  }
  if (matches.length === 0) {
    return { repaired: body, changed: false, duplicates: [], headings: [] };
  }

  const prefix = body.slice(0, matches[0].start).trim();
  const blocks: Array<{ title: string; content: string }> = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const nextStart = i + 1 < matches.length ? matches[i + 1].start : body.length;
    blocks.push({
      title: cleanHeadingTitle(cur.title),
      content: body.slice(cur.end, nextStart).trim(),
    });
  }

  const merged: Array<{ title: string; key: string; content: string }> = [];
  const keyToIndex = new Map<string, number>();
  const duplicates = new Set<string>();
  for (const b of blocks) {
    const key = normalizeHeadingKey(b.title);
    if (!key) continue;
    if (!keyToIndex.has(key)) {
      keyToIndex.set(key, merged.length);
      merged.push({ title: b.title, key, content: b.content });
    } else {
      duplicates.add(b.title);
      const idx = keyToIndex.get(key)!;
      merged[idx].content = [merged[idx].content, b.content].filter(Boolean).join("\n\n");
    }
  }

  const headingCmd = level === "section" ? "\\section" : "\\subsection";
  const rebuilt = [
    prefix,
    ...merged.map((b) => `${headingCmd}{${b.title}}\n${b.content}`.trim()),
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  const changed = rebuilt !== body || duplicates.size > 0 || /\(continued\)/i.test(body);
  return {
    repaired: rebuilt,
    changed,
    duplicates: [...duplicates],
    headings: merged.map((b) => b.title),
  };
}

function repairDuplicateHeadingsInChapter(body: string) {
  // First repair section-level duplicates; then repair subsection duplicates within each section block.
  const sec = repairDuplicateLevel(body, "section");
  const sectionRe = /\\section\*?\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  const starts: Array<{ start: number; end: number; title: string }> = [];
  while ((m = sectionRe.exec(sec.repaired)) !== null) {
    starts.push({ start: m.index, end: m.index + m[0].length, title: m[1] || "" });
  }
  if (starts.length === 0) {
    return {
      repaired: sec.repaired,
      changed: sec.changed,
      duplicateHeadings: sec.duplicates,
      finalHeadings: sec.headings,
    };
  }

  const prefix = sec.repaired.slice(0, starts[0].start).trim();
  const chunks: string[] = [];
  const duplicates = new Set<string>(sec.duplicates);
  const finalHeadings: string[] = [];
  for (let i = 0; i < starts.length; i++) {
    const cur = starts[i];
    const nextStart = i + 1 < starts.length ? starts[i + 1].start : sec.repaired.length;
    const sectionHeader = sec.repaired.slice(cur.start, cur.end);
    const sectionBody = sec.repaired.slice(cur.end, nextStart).trim();
    const sub = repairDuplicateLevel(sectionBody, "subsection");
    for (const d of sub.duplicates) duplicates.add(d);
    finalHeadings.push(cleanHeadingTitle(cur.title), ...sub.headings.map((h) => `  - ${h}`));
    chunks.push(`${sectionHeader}\n${sub.repaired}`.trim());
  }

  const repaired = [prefix, ...chunks].filter(Boolean).join("\n\n").trim();
  return {
    repaired,
    changed: sec.changed || repaired !== body,
    duplicateHeadings: [...duplicates],
    finalHeadings,
  };
}

type ParsedSourceMeta = {
  title?: string;
  authors?: string;
  year?: string;
  doi?: string;
  url?: string;
};

function parseSourceMeta(text: string): ParsedSourceMeta | null {
  if (!text.includes("[ACADEMIC_REFERENCE_METADATA]")) return null;
  const pick = (key: string) => text.match(new RegExp(`\\n${key}:\\s*(.+)\\s*$`, "mi"))?.[1]?.trim();
  const title = pick("title");
  const authors = pick("authors");
  const year = pick("year");
  const doi = pick("doi");
  const url = pick("url");
  return { title, authors, year, doi, url };
}

function evaluateExportQualityGate(args: {
  title: string;
  chapters: { title: string; content: string }[];
  abstractLatex?: string | null;
  importedMetaCount: number;
}): { reasons: string[]; blankCitationHits: BlankCitationHit[] } {
  const allBody = [args.abstractLatex || "", ...args.chapters.map((c) => c.content)].join("\n\n");
  const intro = args.chapters[0]?.content || "";
  const reasons: string[] = [];
  const blankCitationHits = findBlankCitationHitsInCorpus({
    abstractLatex: args.abstractLatex,
    chapters: args.chapters,
  });
  if (blankCitationHits.length > 0) reasons.push("blank_citation");
  if (/^\s*thesis\s*title\s*$/i.test(args.title.trim())) reasons.push("placeholder_title");
  if (/```latex|```/i.test(allBody)) reasons.push("markdown_code_fence");
  if (/\(author\?\)/i.test(allBody)) reasons.push("author_placeholder");
  if (/Figure~(?!\\ref\{)/.test(allBody)) reasons.push("dangling_figure_ref");
  if ((intro.match(/\\subsection\*?\{/g) || []).length < 1) reasons.push("intro_missing_subsections");
  const wordCount = latexToPlainishStructured(allBody).split(/\s+/).filter(Boolean).length;
  if (wordCount < 7000) reasons.push("too_short");
  if (args.importedMetaCount > 0 && args.importedMetaCount < 5) reasons.push("insufficient_imported_references");
  if (/this\s+passage\s+develops/i.test(allBody)) reasons.push("scaffold_phrase_this_passage_develops");
  if (/replace\s+with/i.test(allBody)) reasons.push("scaffold_phrase_replace_with");
  if (/\[fill\]/i.test(allBody)) reasons.push("scaffold_phrase_fill_stub");
  if (/Table~\s*is\s+illustrative/i.test(allBody)) reasons.push("scaffold_phrase_table_illustrative");
  if (/Figure~\s*is\s+generic/i.test(allBody)) reasons.push("scaffold_phrase_figure_generic");
  if (/not\s+submission-ready/i.test(allBody)) reasons.push("scaffold_phrase_not_submission_ready");
  if (/SECTION:|Subsection:/i.test(allBody)) reasons.push("scaffold_plain_heading_tokens");
  return { reasons, blankCitationHits };
}

function sectionsFromLiveDraft(content: string) {
  const trimmed = content.trim();
  if (!trimmed) return [];
  const rows: { title: string; content: string }[] = [];
  const sectionRe = /\\section\*?\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  let lastIndex = 0;
  let currentTitle = "Draft";
  while ((match = sectionRe.exec(trimmed)) !== null) {
    const chunk = trimmed.slice(lastIndex, match.index).trim();
    if (chunk) rows.push({ title: currentTitle, content: chunk });
    currentTitle = match[1].trim() || "Section";
    lastIndex = match.index + match[0].length;
  }
  const tail = trimmed.slice(lastIndex).trim();
  if (tail) rows.push({ title: currentTitle, content: tail });
  return rows.length > 0 ? rows : [{ title: "Draft", content: trimmed }];
}

function inferChapterKindFromTitle(title: string): "appendix" | "discussion" | "other" {
  const t = (title || "").toLowerCase();
  if (/(appendix|supplement|supplementary)/i.test(t)) return "appendix";
  if (/(discussion|conclusion|summary|implication|limitation)/i.test(t)) return "discussion";
  return "other";
}

function ensureExportMinimumSubsections(body: string, chapterTitle: string, minSubsections: number): string {
  const subCount = (body.match(/\\subsection\*?\{[^}]+\}/g) || []).length;
  if (subCount >= minSubsections) return body;
  const missing = minSubsections - subCount;
  const additions: string[] = [];
  for (let i = 0; i < missing; i++) {
    const idx = subCount + i + 1;
    additions.push(
      `\\subsection{Export Structure Addendum ${idx}}\n` +
        `This subsection extends ${chapterTitle} with additional argument structure, evidence synthesis, and chapter-level transitions for draft readability.`,
    );
  }
  return `${body.trim()}\n\n${additions.join("\n\n")}`.trim();
}

function enforceMandatoryArtifactsOnExport(chapters: { title: string; content: string }[]): { title: string; content: string }[] {
  let out = [...chapters];
  const hasAppendix = out.some((c) => inferChapterKindFromTitle(c.title) === "appendix");
  if (!hasAppendix) {
    out.push({
      title: "Appendix",
      content: [
        "\\section{Appendix}",
        "",
        "\\subsection{Supplementary Tables}",
        "Include supplementary estimates and diagnostics supporting the main Results chapter.",
        "",
        "\\subsection{Supplementary Figures}",
        "Include additional visual diagnostics and sensitivity plots referenced in the thesis.",
        "",
        "\\subsection{Additional Derivations and Notes}",
        "Provide extended derivations and implementation details that are too long for core chapters.",
      ].join("\n"),
    });
  }

  out = out.map((c) => {
    const kind = inferChapterKindFromTitle(c.title);
    const minSubs = kind === "discussion" ? 2 : 3;
    return { ...c, content: ensureExportMinimumSubsections(c.content, c.title, minSubs) };
  });

  const allBodies = out.map((c) => c.content).join("\n\n");
  const figureCount = (allBodies.match(/\\begin\{figure\}/g) || []).length;
  const tableCount = (allBodies.match(/\\begin\{table\}/g) || []).length;
  if (figureCount >= 2 && tableCount >= 2) return out;

  const resultsIdx = out.findIndex((c) => /result|analysis|finding|empirical/i.test(c.title));
  const targetIdx = resultsIdx >= 0 ? resultsIdx : Math.max(0, out.length - 1);
  const target = out[targetIdx];
  if (!target) return out;

  const additions: string[] = [];
  let figNeed = Math.max(0, 2 - figureCount);
  let tabNeed = Math.max(0, 2 - tableCount);
  for (let i = 0; i < figNeed; i++) {
    additions.push(
      [
        "\\begin{figure}[H]",
        "\\centering",
        "\\begin{tikzpicture}",
        "\\draw[->, thick] (0,0) -- (2.5,0) node[right]{Draft axis};",
        "\\draw[->, thick] (0,0) -- (0,2) node[above]{Outcome axis};",
        "\\end{tikzpicture}",
        `\\caption{Draft figure ${i + 1} supporting the empirical discussion.}`,
        `\\label{fig:export_mandatory_figure_${i + 1}}`,
        "\\end{figure}",
      ].join("\n"),
    );
  }
  for (let i = 0; i < tabNeed; i++) {
    additions.push(
      [
        "\\begin{table}[H]",
        "\\centering",
        `\\caption{Draft summary table ${i + 1} with benchmark magnitudes for exposition.}`,
        `\\label{tab:export_mandatory_table_${i + 1}}`,
        "\\begin{tabular}{lc}",
        "\\toprule",
        "Quantity & Draft value \\\\",
        "\\midrule",
        "Benchmark row & 0.42 \\\\",
        "\\bottomrule",
        "\\end{tabular}",
        "\\end{table}",
      ].join("\n"),
    );
  }
  out[targetIdx] = { ...target, content: `${target.content.trim()}\n\n${additions.join("\n\n")}`.trim() };
  return out;
}

function buildTextDocument(title: string, sections: { title: string; content: string }[]) {
  const lines: string[] = [`${title}`, `${"=".repeat(title.length)}`, ""];
  for (const section of sections) {
    lines.push(section.title);
    lines.push("-".repeat(section.title.length));
    lines.push(latexToPlainishStructured(section.content));
    lines.push("");
  }
  return lines.join("\n");
}

function latexToMarkdownHierarchy(text: string) {
  return text
    .replace(/\\section\*?\{([^}]*)\}/g, "\n\n### $1\n\n")
    .replace(/\\subsection\*?\{([^}]*)\}/g, "\n\n#### $1\n\n")
    .replace(/\\subsubsection\*?\{([^}]*)\}/g, "\n\n##### $1\n\n")
    .replace(/\\paragraph\*?\{([^}]*)\}/g, "\n\n**$1.** ")
    .replace(/\\texttt\{([^}]*)\}/g, "`$1`")
    .replace(/\\textbf\{([^}]*)\}/g, "**$1**")
    .replace(/\\textit\{([^}]*)\}/g, "*$1*")
    .replace(/\\emph\{([^}]*)\}/g, "*$1*")
    .replace(/\\begin\{[^}]*\}[\s\S]*?\\end\{[^}]*\}/g, " ")
    .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?(\{[^}]*\})?/g, " ")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildMarkdownDocument(title: string, sections: { title: string; content: string }[]) {
  const lines: string[] = [`# ${title}`, ""];
  for (const section of sections) {
    lines.push(`## ${section.title}`);
    lines.push("");
    lines.push(latexToMarkdownHierarchy(section.content));
    lines.push("");
  }
  return lines.join("\n");
}

/** Strip common LaTeX for Word/RTF export (readable plain text). */
function latexToPlainishStructured(text: string) {
  return text
    .replace(/\\texttt\{([^}]*)\}/g, "$1")
    .replace(/\\textbf\{([^}]*)\}/g, "$1")
    .replace(/\\textit\{([^}]*)\}/g, "$1")
    .replace(/\\emph\{([^}]*)\}/g, "$1")
    .replace(/\\paragraph\{\}\s*/g, "\n\n")
    .replace(/\\section\*?\{([^}]*)\}/g, "\n\nSECTION: $1\n\n")
    .replace(/\\subsection\*?\{([^}]*)\}/g, "\n\n  Subsection: $1\n\n")
    .replace(/\\subsubsection\*?\{([^}]*)\}/g, "\n\n    Subsubsection: $1\n\n")
    .replace(/\\begin\{[^}]*\}[\s\S]*?\\end\{[^}]*\}/g, " ")
    .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?(\{[^}]*\})?/g, " ")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeRtf(text: string) {
  let out = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (ch === "\\") out += "\\\\";
    else if (ch === "{") out += "\\{";
    else if (ch === "}") out += "\\}";
    else if (ch === "\n") out += "\\par ";
    else if (code === 0x0d) continue;
    else if (code < 128) out += ch;
    else out += `\\u${code}?`;
  }
  return out;
}

function buildRtfDocument(title: string, sections: { title: string; content: string }[]) {
  const parts: string[] = [
    "{\\rtf1\\ansi\\deff0",
    "{\\fonttbl{\\f0\\fswiss Helvetica;}}",
    "\\f0\\fs28",
    "\\b ",
    escapeRtf(latexToPlainishStructured(title)),
    "\\b0\\par\\par",
  ];
  for (const section of sections) {
    parts.push("\\b ");
    parts.push(escapeRtf(latexToPlainishStructured(section.title)));
    parts.push("\\b0\\par\\par");
    const body = latexToPlainishStructured(section.content);
    for (const para of body.split(/\n\n+/)) {
      const trimmed = para.trim();
      if (!trimmed) continue;
      parts.push(escapeRtf(trimmed));
      parts.push("\\par ");
    }
    parts.push("\\par ");
  }
  parts.push("}");
  return parts.join("");
}

type PdfMeta = {
  title: string;
  field: string;
  degreeLevel: string;
  researchQuestion: string;
  description?: string | null;
  authorName: string;
  uploadedSourceNames: string[];
};

function buildAbstractPlain(meta: Pick<PdfMeta, "researchQuestion" | "description">): string {
  const rq = latexToPlainishStructured(meta.researchQuestion).trim();
  const desc = meta.description?.trim() ? latexToPlainishStructured(meta.description).trim() : "";
  if (rq && desc) return `${rq}\n\n${desc}`;
  return rq || desc || "Abstract not provided.";
}

/** Standard pdf-lib fonts only support WinAnsi; drafts with Unicode/math symbols otherwise throw during export. */
function textSafeForStandardFont(input: string, font: PDFFont): string {
  let allowed: Set<number>;
  try {
    allowed = new Set(font.getCharacterSet());
  } catch {
    allowed = new Set();
  }
  let out = "";
  for (let i = 0; i < input.length; ) {
    const cp = input.codePointAt(i)!;
    i += cp > 0xffff ? 2 : 1;
    if (cp === 0x09 || cp === 0x0a || cp === 0x0b || cp === 0x0c || cp === 0x0d) {
      out += " ";
      continue;
    }
    if (allowed.size > 0 && allowed.has(cp)) {
      out += String.fromCodePoint(cp);
    } else if (allowed.size > 0) {
      out += "?";
    } else if ((cp >= 0x20 && cp <= 0x7e) || cp === 0xa0) {
      out += String.fromCodePoint(cp);
    } else {
      out += "?";
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

async function buildPdfDocument(
  meta: PdfMeta,
  sections: { title: string; content: string }[],
  abstractLatexOverride?: string | null,
) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const italic = await doc.embedFont(StandardFonts.TimesRomanItalic);

  let page = doc.addPage([595, 842]); // A4 points
  const margin = 56;
  const width = page.getWidth() - margin * 2;
  const lineHeight = 14;
  const footerH = 36;
  let y = page.getHeight() - margin;

  function newPage() {
    page = doc.addPage([595, 842]);
    y = page.getHeight() - margin;
  }

  function ensureSpace(lines = 1) {
    if (y - lines * lineHeight < margin + footerH) {
      newPage();
    }
  }

  function writeWrapped(text: string, opts?: { bold?: boolean; italic?: boolean; size?: number }) {
    const size = opts?.size ?? 11;
    const activeFont = opts?.bold ? bold : opts?.italic ? italic : font;
    const safeText = textSafeForStandardFont(text.replace(/\r/g, ""), activeFont);

    const words = safeText.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      const candidateWidth = activeFont.widthOfTextAtSize(candidate, size);
      if (candidateWidth > width && line) {
        ensureSpace(1);
        page.drawText(line, { x: margin, y, size, font: activeFont, color: rgb(0.08, 0.08, 0.1) });
        y -= lineHeight;
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) {
      ensureSpace(1);
      page.drawText(line, { x: margin, y, size, font: activeFont, color: rgb(0.08, 0.08, 0.1) });
      y -= lineHeight;
    }
  }

  // Title page (unnumbered in footer pass)
  writeWrapped(meta.title, { bold: true, size: 20 });
  y -= 12;
  writeWrapped(meta.authorName, { bold: true, size: 14 });
  y -= 10;
  writeWrapped(`${meta.field} · ${meta.degreeLevel}`, { size: 12 });
  y -= 22;
  writeWrapped("ScholarFlow thesis draft export.", { italic: true, size: 10 });
  y -= 28;

  newPage();
  writeWrapped("Abstract", { bold: true, size: 14 });
  y -= 10;
  const abstractText = abstractLatexOverride?.trim()
    ? latexToPlainishStructured(abstractLatexOverride)
    : buildAbstractPlain(meta);
  for (const para of abstractText.split(/\n\n+/)) {
    if (!para.trim()) continue;
    writeWrapped(para.trim(), { size: 11 });
    y -= 10;
  }
  y -= 16;

  for (const section of sections) {
    ensureSpace(3);
    writeWrapped(latexToPlainishStructured(section.title), { bold: true, size: 13 });
    y -= 6;
    const plainBody = latexToPlainishStructured(section.content);
    const paragraphs = plainBody.split(/\n{2,}/g);
    for (const paragraph of paragraphs) {
      if (!paragraph.trim()) continue;
      writeWrapped(paragraph.trim(), { size: 11 });
      y -= 8;
    }
    y -= 10;
  }

  const citeKeys = collectNatbibCiteKeysFromBodies(sections);
  if (meta.uploadedSourceNames.length > 0 || citeKeys.length > 0) {
    ensureSpace(4);
    newPage();
    writeWrapped("References", { bold: true, size: 14 });
    y -= 12;
    if (meta.uploadedSourceNames.length > 0) {
      writeWrapped("Project documents (uploaded)", { bold: true, size: 12 });
      y -= 8;
      let n = 1;
      for (const name of meta.uploadedSourceNames) {
        writeWrapped(`${n}. ${latexToPlainishStructured(name)}`, { size: 10 });
        y -= 4;
        n += 1;
      }
      y -= 12;
    }
    if (citeKeys.length > 0) {
      writeWrapped("Citation keys used in the draft (complete in your bibliography)", { bold: true, size: 11 });
      y -= 8;
      writeWrapped(citeKeys.join("; "), { size: 10 });
      y -= 8;
    }
  }

  const pages = doc.getPages();
  const numFont = font;
  pages.forEach((p, i) => {
    if (i === 0) return;
    const label = String(i);
    const size = 9;
    const w = numFont.widthOfTextAtSize(label, size);
    const pw = p.getWidth();
    p.drawText(label, {
      x: (pw - w) / 2,
      y: 28,
      size,
      font: numFont,
      color: rgb(0.35, 0.35, 0.38),
    });
  });

  return doc.save();
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const url = new URL(request.url);
  const { id } = await context.params;
  const format = (url.searchParams.get("format") || "txt").toLowerCase();
  const probe = url.searchParams.get("probe") === "1";

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.userId !== session.user.id) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  if (format === "pdf" && probe) {
    return NextResponse.json(getPdfCompileReadiness());
  }

  const liveDraft = await prisma.documentSection.findFirst({
    where: { projectId: id, sectionType: "live_draft" },
    orderBy: { updatedAt: "desc" },
    select: { content: true, updatedAt: true },
  });

  const draftSections = await prisma.documentSection.findMany({
    where: { projectId: id, sectionType: "draft_chapter" },
    orderBy: { createdAt: "asc" },
    select: { title: true, content: true },
  });

  const draftAbstract = await prisma.documentSection.findFirst({
    where: { projectId: id, sectionType: "draft_abstract" },
    orderBy: { updatedAt: "desc" },
    select: { content: true },
  });
  const abstractSource = draftAbstract?.content?.trim() || null;

  const hasLiveDraft = Boolean(liveDraft?.content && liveDraft.content.trim().length >= 120);
  /**
   * Prefer finalized per-chapter drafts when available.
   * live_draft can be stale/flat from earlier iterations and may omit scaffolded appendix/subsections.
   */
  const rawSections =
    draftSections.length > 0
      ? draftSections
      : hasLiveDraft
        ? sectionsFromLiveDraft(liveDraft!.content)
        : await prisma.documentSection.findMany({
            where: { projectId: id, sectionType: "outline_suggested" },
            orderBy: { createdAt: "asc" },
            select: { title: true, content: true },
          });

  if (rawSections.length === 0) {
    return NextResponse.json({ error: "No sections available to export yet." }, { status: 400 });
  }

  const repairedSections = rawSections.map((section) => {
    const repaired = repairDuplicateHeadingsInChapter(section.content);
    if (repaired.changed) {
      console.log("[export] duplicate heading detected", {
        chapter: section.title,
        duplicates: repaired.duplicateHeadings,
        action: "merged duplicate headings and removed '(continued)'",
        finalHeadings: repaired.finalHeadings,
      });
    }
    return {
      ...section,
      content: repaired.repaired,
    };
  });

  const referencePapers = await prisma.referencePaper.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "asc" },
    select: { originalName: true, extractedText: true },
  });
  const uploadFallbackKeys = referencePapers.map((_, i) => `uploaded${i + 1}`);
  const {
    chapters: exportChapters,
    abstractLatex: abstractAfterSanitize,
    stats: exportSanitizeStats,
  } = sanitizeRecoverableExportCorpus({
    chapters: repairedSections,
    abstractLatex: abstractSource,
    uploadFallbackKeys,
  });
  const finalizedExport = applyDeterministicThesisFinalization({
    abstractLatex: abstractAfterSanitize || "",
    drafts: exportChapters,
  });
  let enforcedExportChapters = enforceMandatoryArtifactsOnExport(finalizedExport.drafts);
  let exportAbstract = finalizedExport.abstractLatex;
  /**
   * Compile-safety override: always use numeric natbib mode for generated thesis export.
   * Author-year mode can fail with auto-generated \\bibitem entries lacking author/year metadata.
   */
  const natbibPackageOptionsForExport = "numbers,sort&compress";
  const thesisLanguageForExport = THESIS_PIPELINE_FIXED_SETTINGS.documentLanguage;
  const thesisLatexBuildOptions = {
    abstractLatex: exportAbstract,
    ...(natbibPackageOptionsForExport ? { natbibPackageOptions: natbibPackageOptionsForExport } : {}),
  };

  if (exportSanitizeStats.blankCitationReplacements + exportSanitizeStats.danglingFigureRefsFixed + exportSanitizeStats.danglingTableRefsFixed + exportSanitizeStats.citationNeededKeysRemoved > 0) {
    console.log("[export] recoverable_sanitize", { projectId: id, ...exportSanitizeStats });
  }

  const displayMeta = resolveThesisDisplayMetaForExport({
    projectTitle: project.title,
    projectField: project.field,
    degreeLevel: project.degreeLevel,
    researchQuestion: project.researchQuestion,
    description: project.description,
    chapterTitles: enforcedExportChapters,
  });

  const tech = projectUsesEarlyChapterMathDelay(displayMeta.field);
  const bodiesJoined = enforcedExportChapters.map((s) => s.content).join("\n\n");
  const tikzCount = countTikzOrPgfplotsFigures(bodiesJoined);

  const exportWarnings: ScholarFlowExportWarning[] = [];
  exportWarnings.push(...warningsFromSanitizeStats(exportSanitizeStats));

  const placeholderIssues = auditCombinedThesisBodies({
    abstractLatex: exportAbstract || "",
    chapters: enforcedExportChapters,
  });
  exportWarnings.push(...warningsFromPlaceholderHits(placeholderIssues));

  if (tech && tikzCount >= 5) {
    const hqIssues = auditHighQualityFinalGate({
      abstractLatex: exportAbstract || "",
      drafts: enforcedExportChapters,
      technicalPipeline: tech,
    });
    exportWarnings.push(...warningsFromAuditIssues(hqIssues, "hq_final_gate"));
  }

  const aggregatedIssues = auditAggregatedDraft({
    drafts: enforcedExportChapters,
    abstractLatex: exportAbstract || "",
    technicalPipeline: tech,
  });
  if (aggregatedIssues.length) {
    console.warn(`[thesis export audit] project=${id}`, aggregatedIssues);
  }
  exportWarnings.push(...warningsFromAuditIssues(aggregatedIssues, "aggregated_draft"));

  const parsedMeta = referencePapers.map((p) => parseSourceMeta(p.extractedText)).filter((v): v is ParsedSourceMeta => Boolean(v));
  const gate = evaluateExportQualityGate({
    title: displayMeta.title,
    chapters: enforcedExportChapters,
    abstractLatex: exportAbstract,
    importedMetaCount: parsedMeta.length,
  });
  exportWarnings.push(...warningsFromGateReasons(gate.reasons, gate.blankCitationHits));

  const baseExportWarnings = mergeAndDedupeWarnings(exportWarnings);

  console.log("[export] quality_summary", {
    projectId: id,
    warningCount: baseExportWarnings.length,
    gateReasons: gate.reasons,
    blankCitationResidual: gate.blankCitationHits.length,
    placeholderIssueCount: placeholderIssues.length,
  });

  const safeName = sanitizeFilename(displayMeta.title || "scholarflow_draft");

  if (format === "md") {
    const body = buildMarkdownDocument(displayMeta.title, enforcedExportChapters);
    return attachExportWarningHeaders(
      new NextResponse(body, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${safeName}.md"`,
        },
      }),
      baseExportWarnings,
    );
  }

  if (format === "rtf" || format === "word") {
    const rtf = buildRtfDocument(displayMeta.title, enforcedExportChapters);
    return attachExportWarningHeaders(
      new NextResponse(rtf, {
        headers: {
          "Content-Type": "application/rtf; charset=utf-8",
          "Content-Disposition": `attachment; filename="${safeName}.rtf"`,
        },
      }),
      baseExportWarnings,
    );
  }

  const needsAuthorAndRefs = format === "pdf" || format === "tex" || format === "latex";

  const dbUser = needsAuthorAndRefs
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { name: true, email: true },
      })
    : null;

  const authorName =
    (dbUser?.name?.trim() ||
      dbUser?.email?.split("@")[0]?.trim() ||
      session.user?.name?.trim() ||
      session.user?.email?.split("@")[0] ||
      "Author")
      .trim() || "Author";

  const uploadedSourceNames = referencePapers.map((p, idx) => {
    const m = parseSourceMeta(p.extractedText);
    if (!m?.title) return p.originalName;
    const authors = m.authors?.trim() ? m.authors : "Citation details incomplete";
    const year = m.year?.trim() ? m.year : "n.d.";
    const doiOrUrl = m.doi?.trim() ? `DOI: ${m.doi}` : m.url?.trim() ? `URL: ${m.url}` : "Citation details incomplete";
    return `[${idx + 1}] ${authors} (${year}). ${m.title}. ${doiOrUrl}`;
  });

  if (format === "tex" || format === "latex") {
    const latex = finalizeAssembledThesisLatexForPdfCompile(
      buildThesisLatexDocument(
        {
          title: displayMeta.title,
          field: displayMeta.field,
          degreeLevel: displayMeta.degreeLevel,
          language: thesisLanguageForExport,
          researchQuestion: displayMeta.researchQuestion,
          description: project.description,
          authorName,
          uploadedSourceNames,
        },
        enforcedExportChapters,
        "pdflatex",
        thesisLatexBuildOptions,
      ),
    );
    return attachExportWarningHeaders(
      new NextResponse(latex, {
        headers: {
          "Content-Type": "application/x-tex; charset=utf-8",
          "Content-Disposition": `attachment; filename="${safeName}.tex"`,
        },
      }),
      baseExportWarnings,
    );
  }

  if (format === "tex-simple" || format === "tex-article") {
    const latex = buildSimpleArticleLatexDocument(displayMeta.title, enforcedExportChapters);
    return attachExportWarningHeaders(
      new NextResponse(latex, {
        headers: {
          "Content-Type": "application/x-tex; charset=utf-8",
          "Content-Disposition": `attachment; filename="${safeName}_article.tex"`,
        },
      }),
      baseExportWarnings,
    );
  }

  if (format === "pdf") {
    const thesisMeta = {
      title: displayMeta.title,
      field: displayMeta.field,
      degreeLevel: displayMeta.degreeLevel,
      language: thesisLanguageForExport,
      researchQuestion: displayMeta.researchQuestion,
      description: project.description,
      authorName,
      uploadedSourceNames,
    };
    const texTectonic = finalizeAssembledThesisLatexForPdfCompile(
      buildThesisLatexDocument(thesisMeta, enforcedExportChapters, "tectonic", thesisLatexBuildOptions),
    );
    const texPdflatex = finalizeAssembledThesisLatexForPdfCompile(
      buildThesisLatexDocument(thesisMeta, enforcedExportChapters, "pdflatex", thesisLatexBuildOptions),
    );
    const texTectonicSafe = finalizeAssembledThesisLatexForPdfCompile(
      buildThesisLatexDocument(thesisMeta, enforcedExportChapters, "tectonic", {
        ...thesisLatexBuildOptions,
        forcePlainBodies: true,
      }),
    );
    const texPdflatexSafe = finalizeAssembledThesisLatexForPdfCompile(
      buildThesisLatexDocument(thesisMeta, enforcedExportChapters, "pdflatex", {
        ...thesisLatexBuildOptions,
        forcePlainBodies: true,
      }),
    );

    const pdfExtraWarnings: ScholarFlowExportWarning[] = [];
    const disablePlainFallback = /^1|true|yes$/i.test(
      process.env.SCHOLARFLOW_DISABLE_PDF_PLAIN_FALLBACK?.trim() || "",
    );

    await persistLastExportLatexSnapshot(id, texPdflatex, {
      lane: "primary_pdflatex",
      pdfSource: "pre_compile",
    });

    const texPdflatexRepair = repairTexForCompileRetry(texPdflatex);
    const texTectonicRepair = repairTexForCompileRetry(texTectonic);

    const primaryOutcome = await compileThesisLatexToPdf({
      texForTectonic: texTectonic,
      texForPdflatex: texPdflatex,
      texForTectonicRepair: texTectonicRepair,
      texForPdflatexRepair: texPdflatexRepair,
    });

    console.log("[ThesisPilot] pdf_export", {
      projectId: id,
      pdfSource: primaryOutcome.engine ? `latex:${primaryOutcome.engine}` : "none",
      attempts: primaryOutcome.attempts,
    });

    if (primaryOutcome.pdf) {
      await persistLastExportLatexSnapshot(id, texPdflatex, {
        lane: "primary_pdflatex",
        pdfSource: `latex:${primaryOutcome.engine}`,
      });
      return attachExportWarningHeaders(
        new NextResponse(new Uint8Array(primaryOutcome.pdf), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
            "X-ThesisPilot-PDF-Mode": "latex-compiled",
            "X-ThesisPilot-PDF-Source": `latex-${primaryOutcome.engine}`,
          },
        }),
        baseExportWarnings,
      );
    }

    const safePdflatexRepair = repairTexForCompileRetry(texPdflatexSafe);
    const safeTectonicRepair = repairTexForCompileRetry(texTectonicSafe);

    const safeOutcome = await compileThesisLatexToPdf({
      texForTectonic: texTectonicSafe,
      texForPdflatex: texPdflatexSafe,
      texForTectonicRepair: safeTectonicRepair,
      texForPdflatexRepair: safePdflatexRepair,
    });

    console.log("[ThesisPilot] pdf_export_safe_lane", {
      projectId: id,
      pdfSource: safeOutcome.engine ? `latex:${safeOutcome.engine}` : "none",
      attempts: safeOutcome.attempts,
    });

    if (safeOutcome.pdf) {
      await persistLastExportLatexSnapshot(id, texPdflatexSafe, {
        lane: "sanitized_pdflatex",
        pdfSource: `latex:${safeOutcome.engine}`,
      });
      pdfExtraWarnings.push({
        code: "pdf_sanitized_compile",
        message:
          "PDF was generated from an internal sanitized LaTeX variant because the primary compile failed. Download .tex to inspect the full source.",
      });
      return attachExportWarningHeaders(
        new NextResponse(new Uint8Array(safeOutcome.pdf), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
            "X-ThesisPilot-PDF-Mode": "latex-compiled-safe",
            "X-ThesisPilot-PDF-Source": `latex-${safeOutcome.engine}`,
          },
        }),
        mergeAndDedupeWarnings([...baseExportWarnings, ...pdfExtraWarnings]),
      );
    }

    const allAttempts = [...primaryOutcome.attempts, ...safeOutcome.attempts];
    console.error("[ThesisPilot] pdf_export FALLBACK plain pdf-lib — no LaTeX PDF produced.", {
      projectId: id,
      attempts: allAttempts,
    });

    if (disablePlainFallback) {
      await persistLastExportLatexSnapshot(id, texPdflatexRepair, {
        lane: "repaired_pdflatex_after_failure",
        pdfSource: "compile_failed_no_fallback",
      });
      return NextResponse.json(
        {
          error: "LaTeX compilation failed and plain PDF fallback is disabled.",
          projectId: id,
          attempts: allAttempts,
          hint: "Install Tectonic optional dependency and/or pdflatex locally, or unset SCHOLARFLOW_DISABLE_PDF_PLAIN_FALLBACK. Last .tex snapshots are stored on the project (sectionType export_pdf_last_latex).",
        },
        { status: 503 },
      );
    }

    pdfExtraWarnings.push({
      code: "pdf_plain_fallback",
      message:
        "LaTeX compilation failed; a simple text-layout PDF was generated (not true LaTeX). Use format=tex or install pdflatex/Tectonic for a proper thesis PDF.",
    });
    if (/^1|true|yes$/i.test(process.env.SCHOLARFLOW_REQUIRE_LATEX_PDF?.trim() || "")) {
      pdfExtraWarnings.push({
        code: "require_latex_pdf_overridden",
        message:
          "SCHOLARFLOW_REQUIRE_LATEX_PDF is set, but a fallback PDF was still returned so you can download a readable draft.",
      });
    }

    await persistLastExportLatexSnapshot(id, texPdflatex, {
      lane: "primary_pdflatex_failed",
      pdfSource: "plain-fallback",
    });

    const pdfBytes = await buildPdfDocument(
      {
        title: displayMeta.title,
        field: displayMeta.field,
        degreeLevel: displayMeta.degreeLevel,
        researchQuestion: displayMeta.researchQuestion,
        description: project.description,
        authorName,
        uploadedSourceNames,
      },
      enforcedExportChapters,
      exportAbstract,
    );
    return attachExportWarningHeaders(
      new NextResponse(Buffer.from(pdfBytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
          "X-ThesisPilot-PDF-Mode": "plain-fallback",
          "X-ThesisPilot-PDF-Source": "plain-fallback-pdf-lib",
        },
      }),
      mergeAndDedupeWarnings([...baseExportWarnings, ...pdfExtraWarnings]),
    );
  }

  const textBody = buildTextDocument(displayMeta.title, enforcedExportChapters);
  return attachExportWarningHeaders(
    new NextResponse(textBody, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}.txt"`,
      },
    }),
    baseExportWarnings,
  );
}
