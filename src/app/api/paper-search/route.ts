import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getPaperSearchCached, paperSearchCacheKey, setPaperSearchCached } from "@/lib/paper-search-unified-cache";
import { runMultiProviderPaperSearch } from "@/lib/paper-search/multi-provider-search";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  query: z.string().min(2).max(500),
  fields: z.array(z.string()).max(50).default([]),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request.", details: parsed.error.flatten() }, { status: 400 });
  }

  const { query, fields, limit } = parsed.data;
  const q = query.trim();

  const cacheKey = paperSearchCacheKey(q, fields, limit);
  const cached = getPaperSearchCached(cacheKey);
  if (cached) {
    return NextResponse.json({
      papers: cached.papers,
      providersTried: cached.providersTried,
      warnings: cached.warnings,
      cached: true,
    });
  }

  const outcome = await runMultiProviderPaperSearch(q, fields, limit);
  setPaperSearchCached(cacheKey, {
    papers: outcome.papers,
    providersTried: outcome.providersTried,
    warnings: outcome.warnings,
  });

  return NextResponse.json({
    papers: outcome.papers,
    providersTried: outcome.providersTried,
    warnings: outcome.warnings.length ? outcome.warnings : undefined,
  });
}
