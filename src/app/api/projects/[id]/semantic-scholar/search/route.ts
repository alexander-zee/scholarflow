/**
 * Semantic Scholar proxy. Optional: SEMANTIC_SCHOLAR_API_KEY (or S2_API_KEY) for higher rate limits.
 * In-memory cache (per server process) avoids duplicate upstream calls for identical searches.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { semanticScholarSearch } from "@/lib/semantic-scholar";
import {
  getSemanticScholarCached,
  makeSemanticScholarCacheKey,
  setSemanticScholarCached,
  type CachedS2Paper,
} from "@/lib/semantic-scholar-search-cache";

export const dynamic = "force-dynamic";

const RATE_LIMIT_MESSAGE =
  "Semantic Scholar is temporarily rate-limiting requests. Please wait a minute and try again.";

function mapPapers(
  papers: Awaited<ReturnType<typeof semanticScholarSearch>>["papers"],
): CachedS2Paper[] {
  return papers.map((p) => ({
    paperId: p.paperId,
    title: p.title,
    year: p.year,
    citationCount: p.citationCount,
    url: p.url || `https://www.semanticscholar.org/paper/${encodeURIComponent(p.paperId)}`,
    authors: (p.authors || []).slice(0, 4).map((a) => a.name).filter(Boolean) as string[],
    hasOpenAccessPdf: Boolean(p.openAccessPdf?.url),
  }));
}

async function ensureProject(sessionUserId: string, projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.userId !== sessionUserId) {
    return null;
  }
  return project;
}

function jsonRateLimited() {
  return NextResponse.json(
    {
      error: "rate_limited",
      message: RATE_LIMIT_MESSAGE,
      papers: [] as CachedS2Paper[],
    },
    { status: 429 },
  );
}

function jsonApiError(message: string, status = 502) {
  return NextResponse.json(
    {
      error: "api_error",
      message,
      papers: [] as CachedS2Paper[],
    },
    { status },
  );
}

/** GET ?q=... — legacy; uses cache */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!(await ensureProject(session.user.id, id))) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  if (q.length < 2) {
    return NextResponse.json({ error: "bad_request", message: "Query too short (min 2 characters).", papers: [] }, { status: 400 });
  }

  const limit = 20;
  const cacheKey = makeSemanticScholarCacheKey(q, [], limit);
  const cached = getSemanticScholarCached(cacheKey);
  if (cached) {
    return NextResponse.json({ papers: cached, cached: true });
  }

  const result = await semanticScholarSearch(q, limit);
  if (result.httpStatus === 429) {
    return jsonRateLimited();
  }
  if (result.error) {
    return jsonApiError(result.error, result.httpStatus && result.httpStatus >= 400 ? 502 : 502);
  }

  const papers = mapPapers(result.papers);
  setSemanticScholarCached(cacheKey, papers);
  return NextResponse.json({ papers });
}

/** POST { query, fields?: string[], limit?: number } */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!(await ensureProject(session.user.id, id))) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  let body: { query?: unknown; fields?: unknown; limit?: unknown };
  try {
    body = (await request.json()) as { query?: unknown; fields?: unknown; limit?: unknown };
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Invalid JSON body.", papers: [] }, { status: 400 });
  }

  const query = String(body.query ?? "").trim();
  const fields = Array.isArray(body.fields) ? body.fields.map((f) => String(f).trim()).filter(Boolean) : [];
  const limit = Math.min(100, Math.max(1, Number(body.limit) || 20));

  if (query.length < 2) {
    return NextResponse.json(
      {
        error: "bad_request",
        message: "Query too short (min 2 characters). Use the workspace prompt or the search box.",
        papers: [],
      },
      { status: 400 },
    );
  }

  const combinedQuery = [query, ...fields].filter(Boolean).join(" ").trim();
  const cacheKey = makeSemanticScholarCacheKey(query, fields, limit);
  const cached = getSemanticScholarCached(cacheKey);
  if (cached) {
    return NextResponse.json({ papers: cached, cached: true });
  }

  const result = await semanticScholarSearch(combinedQuery, limit);
  if (result.httpStatus === 429) {
    return jsonRateLimited();
  }
  if (result.error) {
    return jsonApiError(result.error || "Semantic Scholar request failed.", 502);
  }

  const papers = mapPapers(result.papers);
  setSemanticScholarCached(cacheKey, papers);
  return NextResponse.json({ papers });
}
