import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  buildSimpleArticleLatexDocument,
  buildThesisLatexDocument,
  collectNatbibCiteKeysFromBodies,
} from "@/lib/thesis-latex-export";
import { compileThesisLatexToPdf, getPdfCompileReadiness } from "@/lib/compile-latex-pdf";
import { countTikzOrPgfplotsFigures } from "@/lib/thesis-figures-tables";
import { auditCombinedThesisBodies } from "@/lib/thesis-placeholder-audit";
import { auditAggregatedDraft, auditHighQualityFinalGate } from "@/lib/thesis-quality-audit";
import { projectUsesEarlyChapterMathDelay } from "@/lib/thesis-prompt-standards";

function sanitizeFilename(input: string) {
  return input.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 64) || "scholarflow_draft";
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

    const words = text.replace(/\r/g, "").split(/\s+/);
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
  writeWrapped("ThesisPilot draft export — not submission-ready.", { italic: true, size: 10 });
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
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") || "txt").toLowerCase();
  const probe = url.searchParams.get("probe") === "1";

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
  const abstractLatex = draftAbstract?.content?.trim() || null;

  const hasLiveDraft = Boolean(liveDraft?.content && liveDraft.content.trim().length >= 120);
  const sections = hasLiveDraft
    ? sectionsFromLiveDraft(liveDraft!.content)
    : draftSections.length > 0
      ? draftSections
      : await prisma.documentSection.findMany({
          where: { projectId: id, sectionType: "outline_suggested" },
          orderBy: { createdAt: "asc" },
          select: { title: true, content: true },
        });

  if (sections.length === 0) {
    return NextResponse.json({ error: "No sections available to export yet." }, { status: 400 });
  }

  if (format === "pdf" || format === "tex" || format === "latex") {
    const tech = projectUsesEarlyChapterMathDelay(project.field);
    const placeholderIssues = auditCombinedThesisBodies({
      abstractLatex: abstractLatex || "",
      chapters: sections,
    });
    if (placeholderIssues.length > 0) {
      return NextResponse.json(
        {
          error:
            "Thesis export blocked: placeholder leaks or broken references detected. Edit the draft or regenerate with high-quality mode.",
          issues: placeholderIssues,
        },
        { status: 422 },
      );
    }

    const bodiesJoined = sections.map((s) => s.content).join("\n\n");
    const tikzCount = countTikzOrPgfplotsFigures(bodiesJoined);
    if (tech && tikzCount >= 5) {
      const hqIssues = auditHighQualityFinalGate({
        abstractLatex: abstractLatex || "",
        drafts: sections,
        technicalPipeline: tech,
      });
      if (hqIssues.length > 0) {
        return NextResponse.json(
          {
            error: "Thesis export blocked: high-quality technical checks failed (figures, tables, math placement, or duplicate headings).",
            issues: hqIssues,
          },
          { status: 422 },
        );
      }
    }

    const issues = auditAggregatedDraft({
      drafts: sections,
      abstractLatex: abstractLatex || "",
      technicalPipeline: tech,
    });
    if (issues.length) {
      console.warn(`[thesis export audit] project=${id}`, issues);
    }
  }

  const safeName = sanitizeFilename(project.title || "scholarflow_draft");

  if (format === "md") {
    const body = buildMarkdownDocument(project.title, sections);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}.md"`,
      },
    });
  }

  if (format === "rtf" || format === "word") {
    const rtf = buildRtfDocument(project.title, sections);
    return new NextResponse(rtf, {
      headers: {
        "Content-Type": "application/rtf; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}.rtf"`,
      },
    });
  }

  const needsAuthorAndRefs = format === "pdf" || format === "tex" || format === "latex";

  const [dbUser, referencePapers] = needsAuthorAndRefs
    ? await Promise.all([
        prisma.user.findUnique({
          where: { id: session.user.id },
          select: { name: true, email: true },
        }),
        prisma.referencePaper.findMany({
          where: { projectId: id },
          orderBy: { createdAt: "asc" },
          select: { originalName: true },
        }),
      ])
    : [null, [] as { originalName: string }[]];

  const authorName =
    (dbUser?.name?.trim() ||
      dbUser?.email?.split("@")[0]?.trim() ||
      session.user?.name?.trim() ||
      session.user?.email?.split("@")[0] ||
      "Author")
      .trim() || "Author";

  const uploadedSourceNames = referencePapers.map((p) => p.originalName);

  if (format === "tex" || format === "latex") {
    const latex = buildThesisLatexDocument(
      {
        title: project.title,
        field: project.field,
        degreeLevel: project.degreeLevel,
        language: project.language,
        researchQuestion: project.researchQuestion,
        description: project.description,
        authorName,
        uploadedSourceNames,
      },
      sections,
      "pdflatex",
      { abstractLatex },
    );
    return new NextResponse(latex, {
      headers: {
        "Content-Type": "application/x-tex; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}.tex"`,
      },
    });
  }

  if (format === "tex-simple" || format === "tex-article") {
    const latex = buildSimpleArticleLatexDocument(project.title, sections);
    return new NextResponse(latex, {
      headers: {
        "Content-Type": "application/x-tex; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}_article.tex"`,
      },
    });
  }

  if (format === "pdf") {
    const thesisMeta = {
      title: project.title,
      field: project.field,
      degreeLevel: project.degreeLevel,
      language: project.language,
      researchQuestion: project.researchQuestion,
      description: project.description,
      authorName,
      uploadedSourceNames,
    };
    const texTectonic = buildThesisLatexDocument(thesisMeta, sections, "tectonic", { abstractLatex });
    const texPdflatex = buildThesisLatexDocument(thesisMeta, sections, "pdflatex", { abstractLatex });
    const texTectonicSafe = buildThesisLatexDocument(thesisMeta, sections, "tectonic", {
      forcePlainBodies: true,
      abstractLatex,
    });
    const texPdflatexSafe = buildThesisLatexDocument(thesisMeta, sections, "pdflatex", {
      forcePlainBodies: true,
      abstractLatex,
    });

    const compiled = await compileThesisLatexToPdf({
      texForTectonic: texTectonic,
      texForPdflatex: texPdflatex,
    });
    if (compiled) {
      return new NextResponse(new Uint8Array(compiled), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
          "X-ThesisPilot-PDF-Mode": "latex-compiled",
        },
      });
    }

    const compiledSafe = await compileThesisLatexToPdf({
      texForTectonic: texTectonicSafe,
      texForPdflatex: texPdflatexSafe,
    });
    if (compiledSafe) {
      return new NextResponse(new Uint8Array(compiledSafe), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
          "X-ThesisPilot-PDF-Mode": "latex-compiled-safe",
        },
      });
    }

    const requireLatexPdf = /^1|true|yes$/i.test(process.env.SCHOLARFLOW_REQUIRE_LATEX_PDF?.trim() || "");
    if (requireLatexPdf) {
      return NextResponse.json(
        {
          error:
            "ThesisPilot could not compile a LaTeX thesis PDF. Configure Tectonic or pdflatex, or unset SCHOLARFLOW_REQUIRE_LATEX_PDF to allow fallback PDFs.",
        },
        { status: 500 },
      );
    }

    const pdfBytes = await buildPdfDocument(
      {
        title: project.title,
        field: project.field,
        degreeLevel: project.degreeLevel,
        researchQuestion: project.researchQuestion,
        description: project.description,
        authorName,
        uploadedSourceNames,
      },
      sections,
      abstractLatex,
    );
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
        "X-ThesisPilot-PDF-Mode": "plain-fallback",
      },
    });
  }

  const textBody = buildTextDocument(project.title, sections);
  return new NextResponse(textBody, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}.txt"`,
    },
  });
}
