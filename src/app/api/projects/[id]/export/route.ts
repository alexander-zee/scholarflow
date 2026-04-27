import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

function sanitizeFilename(input: string) {
  return input.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 64) || "scholarflow_draft";
}

function buildTextDocument(title: string, sections: { title: string; content: string }[]) {
  const lines: string[] = [`${title}`, `${"=".repeat(title.length)}`, ""];
  for (const section of sections) {
    lines.push(section.title);
    lines.push("-".repeat(section.title.length));
    lines.push(section.content);
    lines.push("");
  }
  return lines.join("\n");
}

function buildMarkdownDocument(title: string, sections: { title: string; content: string }[]) {
  const lines: string[] = [`# ${title}`, ""];
  for (const section of sections) {
    lines.push(`## ${section.title}`);
    lines.push("");
    lines.push(section.content);
    lines.push("");
  }
  return lines.join("\n");
}

function latexEscape(input: string) {
  return input
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([{}$&#_%])/g, "\\$1")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/~/g, "\\textasciitilde{}");
}

function buildLatexDocument(title: string, sections: { title: string; content: string }[]) {
  const body = sections
    .map((section) => {
      const sectionTitle = latexEscape(section.title);
      const paragraphs = section.content
        .split(/\n{2,}/g)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => latexEscape(p))
        .join("\n\n");
      return `\\section{${sectionTitle}}\n${paragraphs}\n`;
    })
    .join("\n");

  return `\\documentclass[12pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\usepackage[margin=1in]{geometry}
\\usepackage{setspace}
\\usepackage{hyperref}
\\onehalfspacing

\\title{${latexEscape(title)}}
\\author{ScholarFlow Draft}
\\date{\\today}

\\begin{document}
\\maketitle
\\tableofcontents
\\newpage

${body}

\\section*{Academic Integrity Notice}
${latexEscape(
    "Use these suggestions as guidance. Review, edit, and ensure your final submission follows your institution's academic integrity rules.",
  )}

\\end{document}
`;
}

async function buildPdfDocument(title: string, sections: { title: string; content: string }[]) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([595, 842]); // A4 points
  const margin = 50;
  const width = page.getWidth() - margin * 2;
  const lineHeight = 15;
  let y = page.getHeight() - margin;

  function newPage() {
    page = doc.addPage([595, 842]);
    y = page.getHeight() - margin;
  }

  function ensureSpace(lines = 1) {
    if (y - lines * lineHeight < margin) {
      newPage();
    }
  }

  function writeWrapped(text: string, opts?: { bold?: boolean; size?: number }) {
    const size = opts?.size ?? 11;
    const useBold = opts?.bold ?? false;
    const activeFont = useBold ? bold : font;

    const words = text.replace(/\r/g, "").split(/\s+/);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      const candidateWidth = activeFont.widthOfTextAtSize(candidate, size);
      if (candidateWidth > width && line) {
        ensureSpace(1);
        page.drawText(line, { x: margin, y, size, font: activeFont, color: rgb(0.1, 0.1, 0.1) });
        y -= lineHeight;
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) {
      ensureSpace(1);
      page.drawText(line, { x: margin, y, size, font: activeFont, color: rgb(0.1, 0.1, 0.1) });
      y -= lineHeight;
    }
  }

  writeWrapped(title, { bold: true, size: 18 });
  y -= 8;

  for (const section of sections) {
    ensureSpace(2);
    writeWrapped(section.title, { bold: true, size: 14 });
    y -= 2;
    const paragraphs = section.content.split(/\n{2,}/g);
    for (const paragraph of paragraphs) {
      if (!paragraph.trim()) continue;
      writeWrapped(paragraph.trim(), { size: 11 });
      y -= 6;
    }
    y -= 8;
  }

  return doc.save();
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const format = (new URL(request.url).searchParams.get("format") || "txt").toLowerCase();

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.userId !== session.user.id) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const draftSections = await prisma.documentSection.findMany({
    where: { projectId: id, sectionType: "draft_chapter" },
    orderBy: { createdAt: "asc" },
    select: { title: true, content: true },
  });

  const sections =
    draftSections.length > 0
      ? draftSections
      : await prisma.documentSection.findMany({
          where: { projectId: id, sectionType: "outline_suggested" },
          orderBy: { createdAt: "asc" },
          select: { title: true, content: true },
        });

  if (sections.length === 0) {
    return NextResponse.json({ error: "No sections available to export yet." }, { status: 400 });
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

  if (format === "tex" || format === "latex") {
    const latex = buildLatexDocument(project.title, sections);
    return new NextResponse(latex, {
      headers: {
        "Content-Type": "application/x-tex; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}.tex"`,
      },
    });
  }

  if (format === "pdf") {
    const pdfBytes = await buildPdfDocument(project.title, sections);
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
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
