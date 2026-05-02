const { PrismaClient } = require("@prisma/client");
const { encode } = require("next-auth/jwt");

async function main() {
  const prisma = new PrismaClient();
  try {
    const projectId = process.argv[2];
    if (!projectId) {
      console.error("Usage: node scripts/export-diagnostic.js <projectId>");
      process.exit(2);
    }
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true, title: true },
    });
    if (!project) {
      console.error("PROJECT_NOT_FOUND");
      process.exit(3);
    }
    const user = await prisma.user.findUnique({
      where: { id: project.userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) {
      console.error("PROJECT_OWNER_NOT_FOUND");
      process.exit(4);
    }
    const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
    const token = await encode({
      token: { sub: user.id, id: user.id, email: user.email, name: user.name || user.email || "user" },
      secret,
      maxAge: 60 * 60,
    });
    const probe = process.argv.includes("--probe");
    const url = probe
      ? `http://localhost:3000/api/projects/${projectId}/export?format=pdf&probe=1`
      : `http://localhost:3000/api/projects/${projectId}/export?format=pdf`;
    for (const cookieName of ["next-auth.session-token", "__Secure-next-auth.session-token"]) {
      const res = await fetch(url, { headers: { cookie: `${cookieName}=${token}` } });
      const contentType = res.headers.get("content-type") || "";
      const body = contentType.includes("application/json") ? await res.text() : "";
      console.log(
        JSON.stringify(
          {
            cookieName,
            status: res.status,
            contentType,
            pdfSource: res.headers.get("x-thesispilot-pdf-source"),
            pdfMode: res.headers.get("x-thesispilot-pdf-mode"),
            body: body.slice(0, 4000),
          },
          null,
          2,
        ),
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
