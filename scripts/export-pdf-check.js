const { PrismaClient } = require("@prisma/client");
const { encode } = require("next-auth/jwt");
const pdfParse = require("pdf-parse");
const fs = require("fs");

async function main() {
  const projectId = process.argv[2];
  if (!projectId) {
    console.error("Usage: node scripts/export-pdf-check.js <projectId>");
    process.exit(2);
  }
  const prisma = new PrismaClient();
  try {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { userId: true } });
    if (!project) throw new Error("project_not_found");
    const user = await prisma.user.findUnique({
      where: { id: project.userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) throw new Error("owner_not_found");
    const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
    const token = await encode({
      token: { sub: user.id, id: user.id, email: user.email, name: user.name || user.email || "user" },
      secret,
      maxAge: 3600,
    });
    const res = await fetch(`http://localhost:3000/api/projects/${projectId}/export?format=pdf`, {
      headers: { cookie: `next-auth.session-token=${token}` },
    });
    const out = {
      status: res.status,
      contentType: res.headers.get("content-type"),
      pdfSource: res.headers.get("x-thesispilot-pdf-source"),
      pdfMode: res.headers.get("x-thesispilot-pdf-mode"),
    };
    if (!res.ok) {
      const body = await res.text();
      console.log(JSON.stringify({ ...out, body: body.slice(0, 8000) }, null, 2));
      return;
    }
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    fs.writeFileSync("tmp-export-check.pdf", buf);
    const parsed = await pdfParse(buf);
    const text = parsed.text || "";
    const checks = {
      hasContents: /\bContents\b/i.test(text) || /table of contents/i.test(text),
      hasEquationHint: /Y_i|alpha|beta|varepsilon|equation/i.test(text),
      hasTableWord: /\bTable\b/i.test(text),
      hasFigureWord: /\bFigure\b/i.test(text),
    };
    console.log(JSON.stringify({ ...out, pdfBytes: buf.length, checks, textPreview: text.slice(0, 3000) }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
