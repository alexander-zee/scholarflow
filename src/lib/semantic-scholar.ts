const S2_GRAPH = "https://api.semanticscholar.org/graph/v1";

export type SemanticScholarHit = {
  paperId: string;
  title: string;
  year?: number;
  url?: string;
  citationCount?: number;
  authors?: Array<{ name?: string }>;
  openAccessPdf?: { url?: string; status?: string } | null;
  abstract?: string;
  externalIds?: { DOI?: string; ArXiv?: string };
};

/** Fields aligned with Semantic Scholar Graph API paper search. */
const SEARCH_FIELDS =
  "title,authors,year,abstract,url,citationCount,paperId,openAccessPdf,externalIds";

export type SemanticScholarSearchResult = {
  papers: SemanticScholarHit[];
  /** Present when the HTTP call failed or the payload could not be parsed. */
  error?: string;
  httpStatus?: number;
};

function s2ApiKey(): string | undefined {
  const k = process.env.SEMANTIC_SCHOLAR_API_KEY || process.env.S2_API_KEY;
  return k?.trim() || undefined;
}

/**
 * Server-side Semantic Scholar paper search.
 * Set SEMANTIC_SCHOLAR_API_KEY (or S2_API_KEY) for higher rate limits; otherwise public tier may return 429.
 */
export async function semanticScholarSearch(
  query: string,
  limit: number,
  options?: { fieldBoost?: string[] },
): Promise<SemanticScholarSearchResult> {
  const base = query.trim().slice(0, 400);
  if (!base) {
    return { papers: [], error: "Empty search query.", httpStatus: 400 };
  }

  const boost = (options?.fieldBoost || [])
    .map((f) => String(f).trim())
    .filter(Boolean)
    .join(" ");
  const combined = boost ? `${base} ${boost}`.trim() : base;

  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  const url = `${S2_GRAPH}/paper/search?query=${encodeURIComponent(combined)}&limit=${safeLimit}&fields=${SEARCH_FIELDS}`;

  const apiKey = s2ApiKey();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "ThesisPilot/1.0 (https://thesispilot; academic search)",
  };
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  try {
    const resp = await fetch(url, { headers, cache: "no-store" });
    const rawText = await resp.text();

    if (!resp.ok) {
      let message = rawText.slice(0, 500);
      try {
        const errJson = JSON.parse(rawText) as { message?: string; code?: string };
        if (errJson.message) {
          message = errJson.message;
          if (errJson.code) message = `${errJson.code}: ${message}`;
        }
      } catch {
        // keep raw slice
      }
      return {
        papers: [],
        error: message || `Semantic Scholar returned HTTP ${resp.status}.`,
        httpStatus: resp.status,
      };
    }

    let data: { data?: SemanticScholarHit[] };
    try {
      data = JSON.parse(rawText) as { data?: SemanticScholarHit[] };
    } catch {
      return { papers: [], error: "Semantic Scholar returned invalid JSON.", httpStatus: 502 };
    }

    const rows = (data.data || []).filter((p) => {
      const id = (p as { paperId?: string }).paperId;
      const title = (p as { title?: string }).title;
      return Boolean(id && title);
    });
    rows.sort((a, b) => (b.citationCount || 0) - (a.citationCount || 0));
    return { papers: rows.slice(0, safeLimit) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    return { papers: [], error: `Semantic Scholar request failed: ${msg}`, httpStatus: 502 };
  }
}

export async function semanticScholarPaperForImport(paperId: string): Promise<{
  title: string;
  openAccessPdf?: { url?: string } | null;
}> {
  const id = encodeURIComponent(paperId.trim());
  if (!id) throw new Error("Missing paper id.");
  const url = `${S2_GRAPH}/paper/${id}?fields=title,openAccessPdf`;
  const apiKey = s2ApiKey();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "ThesisPilot/1.0 (paper import)",
  };
  if (apiKey) headers["x-api-key"] = apiKey;

  const resp = await fetch(url, { headers, cache: "no-store" });
  if (!resp.ok) throw new Error("Could not load paper from Semantic Scholar.");
  const body = (await resp.json()) as { title?: string; openAccessPdf?: { url?: string } | null };
  if (!body.title) throw new Error("Paper has no title.");
  return { title: body.title, openAccessPdf: body.openAccessPdf };
}
