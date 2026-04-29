import type { PaperResult } from "@/lib/paper-result";
import { semanticScholarSearch, type SemanticScholarHit } from "@/lib/semantic-scholar";

const UA = "ThesisPilot/1.0 (mailto:support@thesispilot.com; academic paper search)";

export type MultiProviderSearchOutcome = {
  papers: PaperResult[];
  providersTried: string[];
  warnings: string[];
};

function combinedQuery(query: string, fields: string[]): string {
  const base = query.trim().slice(0, 400);
  const boost = fields
    .map((f) => String(f).trim())
    .filter(Boolean)
    .join(" ");
  return boost ? `${base} ${boost}`.trim() : base;
}

function normalizeDoi(d: string | undefined): string | undefined {
  if (!d) return undefined;
  const x = d.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "");
  return x || undefined;
}

function normalizeTitleKey(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function titleDice(a: string, b: string): number {
  const wa = new Set(normalizeTitleKey(a).split(" ").filter((w) => w.length > 2));
  const wb = new Set(normalizeTitleKey(b).split(" ").filter((w) => w.length > 2));
  if (wa.size === 0 || wb.size === 0) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter += 1;
  return (2 * inter) / (wa.size + wb.size);
}

function invertedIndexToAbstract(inv: Record<string, number[]> | undefined): string | undefined {
  if (!inv || typeof inv !== "object") return undefined;
  const slots: string[] = [];
  let max = 0;
  for (const [word, positions] of Object.entries(inv)) {
    if (!Array.isArray(positions)) continue;
    for (const p of positions) {
      const idx = typeof p === "number" ? p : Number(p);
      if (!Number.isFinite(idx)) continue;
      max = Math.max(max, idx);
      slots[idx] = word;
    }
  }
  const text = slots.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return text.slice(0, 4000) || undefined;
}

async function fetchOpenAlex(q: string, perPage: number): Promise<PaperResult[]> {
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(q)}&per_page=${perPage}`;
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) throw new Error(`OpenAlex HTTP ${res.status}`);
  const data = (await res.json()) as {
    results?: Array<{
      id?: string;
      title?: string;
      publication_year?: number;
      abstract_inverted_index?: Record<string, number[]>;
      authorships?: Array<{ author?: { display_name?: string } }>;
      cited_by_count?: number;
      doi?: string;
      best_oa_location?: { pdf_url?: string | null } | null;
      primary_location?: { landing_page_url?: string | null } | null;
      open_access?: { oa_url?: string | null } | null;
    }>;
  };
  const rows = data.results || [];
  const out: PaperResult[] = [];
  for (const w of rows) {
    const title = (w.title || "").trim();
    if (!title) continue;
    const authors =
      (w.authorships || []).map((a) => a.author?.display_name).filter((n): n is string => Boolean(n && n.trim())) ||
      [];
    const doi = normalizeDoi(w.doi?.replace(/^https?:\/\/doi\.org\//i, ""));
    const pdfUrl =
      w.best_oa_location?.pdf_url?.trim() ||
      w.open_access?.oa_url?.trim() ||
      undefined;
    const urlPage =
      w.primary_location?.landing_page_url?.trim() ||
      (doi ? `https://doi.org/${doi}` : undefined) ||
      (w.id?.startsWith("http") ? w.id : undefined);
    out.push({
      title,
      authors,
      year: w.publication_year,
      abstract: invertedIndexToAbstract(w.abstract_inverted_index),
      url: urlPage,
      pdfUrl,
      doi,
      citationCount: typeof w.cited_by_count === "number" ? w.cited_by_count : undefined,
      source: "openalex",
    });
  }
  return out;
}

async function fetchCrossref(q: string, rows: number): Promise<PaperResult[]> {
  const url = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(q)}&rows=${rows}&select=DOI,title,author,published-print,published-online,abstract,link,is-referenced-by-count`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Crossref HTTP ${res.status}`);
  const data = (await res.json()) as {
    message?: {
      items?: Array<{
        DOI?: string;
        title?: string[];
        author?: Array<{ given?: string; family?: string }>;
        abstract?: string;
        link?: Array<{ URL?: string; "content-type"?: string }>;
        "is-referenced-by-count"?: number;
        "published-print"?: { "date-parts"?: number[][] };
        "published-online"?: { "date-parts"?: number[][] };
      }>;
    };
  };
  const items = data.message?.items || [];
  const out: PaperResult[] = [];
  for (const it of items) {
    const title = (it.title?.[0] || "").trim();
    if (!title) continue;
    const authors = (it.author || [])
      .map((a) => [a.given, a.family].filter(Boolean).join(" ").trim())
      .filter(Boolean);
    const doi = normalizeDoi(it.DOI);
    const parts = it["published-print"]?.["date-parts"]?.[0] || it["published-online"]?.["date-parts"]?.[0];
    const year = parts?.[0];
    let abstract: string | undefined;
    if (typeof it.abstract === "string") {
      abstract = it.abstract.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000);
    }
    let pdfUrl: string | undefined;
    for (const l of it.link || []) {
      const ct = (l["content-type"] || "").toLowerCase();
      if (ct.includes("pdf") && l.URL) {
        pdfUrl = l.URL;
        break;
      }
    }
    out.push({
      title,
      authors,
      year: typeof year === "number" ? year : undefined,
      abstract,
      url: doi ? `https://doi.org/${doi}` : undefined,
      pdfUrl,
      doi,
      citationCount:
        typeof it["is-referenced-by-count"] === "number" ? it["is-referenced-by-count"] : undefined,
      source: "crossref",
    });
  }
  return out;
}

function parseArxivEntries(xml: string): PaperResult[] {
  const entries = xml.split(/<entry[\s>]/i).slice(1);
  const out: PaperResult[] = [];
  for (const block of entries) {
    const idMatch = block.match(/<id>\s*([^<]+)\s*<\/id>/i);
    const idUrl = idMatch?.[1]?.trim() || "";
    const arxivIdMatch = idUrl.match(/arxiv\.org\/abs\/([\w.-]+)/i);
    const arxivId = arxivIdMatch?.[1]?.replace(/v\d+$/i, "") || "";
    const titleMatch = block.match(/<title>\s*([\s\S]*?)\s*<\/title>/i);
    const title = titleMatch?.[1]?.replace(/\s+/g, " ").trim() || "";
    if (!title || !arxivId) continue;
    const summaryMatch = block.match(/<summary>\s*([\s\S]*?)\s*<\/summary>/i);
    const abstract = summaryMatch?.[1]?.replace(/\s+/g, " ").trim().slice(0, 4000);
    const publishedMatch = block.match(/<published>\s*(\d{4})-\d{2}-\d{2}/i);
    const year = publishedMatch?.[1] ? Number(publishedMatch[1]) : undefined;
    const authors: string[] = [];
    const authorBlocks = block.match(/<author>[\s\S]*?<\/author>/gi) || [];
    for (const ab of authorBlocks) {
      const nm = ab.match(/<name>\s*([^<]+)\s*<\/name>/i);
      if (nm?.[1]?.trim()) authors.push(nm[1].trim());
    }
    const pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;
    const url = `https://arxiv.org/abs/${arxivId}`;
    out.push({
      title,
      authors,
      year: Number.isFinite(year) ? year : undefined,
      abstract,
      url,
      pdfUrl,
      doi: undefined,
      citationCount: undefined,
      source: "arxiv",
    });
  }
  return out;
}

async function fetchArxiv(q: string, maxResults: number): Promise<PaperResult[]> {
  const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(q)}&start=0&max_results=${maxResults}`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) throw new Error(`arXiv HTTP ${res.status}`);
  const xml = await res.text();
  return parseArxivEntries(xml);
}

function fromSemanticHits(rows: SemanticScholarHit[]): PaperResult[] {
  return rows.map((p) => {
    const authors = (p.authors || []).map((a) => a.name).filter((n): n is string => Boolean(n?.trim()));
    const doi = normalizeDoi(p.externalIds?.DOI);
    const abst = typeof p.abstract === "string" ? p.abstract : undefined;
    return {
      title: p.title,
      authors,
      year: p.year,
      abstract: abst,
      url: p.url?.trim() || undefined,
      pdfUrl: p.openAccessPdf?.url?.trim() || undefined,
      doi,
      citationCount: p.citationCount,
      semanticScholarPaperId: p.paperId,
      source: "semantic_scholar" as const,
    };
  });
}

function rankScore(p: PaperResult, query: string): number {
  let s = 0;
  s += Math.min(50, (p.citationCount || 0) * 0.05);
  const y = p.year;
  if (y != null) {
    if (y >= 2020) s += 8;
    else if (y >= 2015) s += 5;
    else if (y >= 2010) s += 2;
  }
  const alen = (p.abstract || "").length;
  if (alen > 200) s += 6;
  else if (alen > 40) s += 3;
  s += titleDice(p.title, query) * 35;
  if (p.pdfUrl) s += 4;
  if (p.doi) s += 1;
  return s;
}

function dedupeAndRank(papers: PaperResult[], query: string, limit: number): PaperResult[] {
  const seenDoi = new Set<string>();
  const seenUrl = new Set<string>();
  const kept: PaperResult[] = [];

  const sorted = [...papers].sort((a, b) => rankScore(b, query) - rankScore(a, query));

  for (const p of sorted) {
    const doi = normalizeDoi(p.doi);
    if (doi && seenDoi.has(doi)) continue;
    if (doi) seenDoi.add(doi);

    const u = (p.pdfUrl || p.url || "").trim().toLowerCase();
    if (u && seenUrl.has(u)) continue;
    if (u) seenUrl.add(u);

    let dupTitle = false;
    const nt = normalizeTitleKey(p.title);
    for (const k of kept) {
      if (titleDice(p.title, k.title) >= 0.92 || (nt.length > 24 && nt === normalizeTitleKey(k.title))) {
        dupTitle = true;
        break;
      }
    }
    if (dupTitle) continue;

    kept.push(p);
    if (kept.length >= limit) break;
  }
  return kept;
}

function buildSearchGuidance(query: string, fields: string[]): PaperResult[] {
  const q = query.trim();
  const f = fields.filter(Boolean);
  const lines = [
    "This is search guidance only — these are not indexed papers from our providers.",
    "",
    "Try running these searches in Google Scholar, your library catalog, or OpenAlex:",
    `• "${q}"`,
    f.length ? `• "${q} ${f.slice(0, 3).join(" ")}"` : null,
    `• "${q.split(/\s+/).slice(0, 4).join(" ")} review"`,
    `• "${q.split(/\s+/).slice(0, 3).join(" ")} survey"`,
    f.includes("Economics") || /econ|pricing|finance/i.test(q) ? `• "${q} journal of finance OR econometrica"` : null,
    /ml|machine learning|neural/i.test(q) ? `• "${q} proceedings ICML OR NeurIPS"` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    {
      title: "(Search guidance — not found papers)",
      authors: [],
      abstract: lines,
      url: "https://openalex.org/",
      source: "search_guidance",
    },
  ];
}

export async function runMultiProviderPaperSearch(
  query: string,
  fields: string[],
  limit: number,
): Promise<MultiProviderSearchOutcome> {
  const providersTried: string[] = [];
  const warnings: string[] = [];
  const q = combinedQuery(query, fields);
  const requested = Math.min(100, Math.max(1, Math.floor(limit)));
  /** Prefer at least 10 hits when the catalog has them (spec). */
  const outLimit = Math.min(100, Math.max(10, requested));
  const perProvider = Math.min(40, outLimit + 20);

  const merged: PaperResult[] = [];

  if (!q) {
    return {
      papers: buildSearchGuidance(query, fields),
      providersTried: [],
      warnings: ["empty_query"],
    };
  }

  // 1. Semantic Scholar
  providersTried.push("semantic_scholar");
  try {
    const s2 = await semanticScholarSearch(query, Math.min(100, perProvider), { fieldBoost: fields });
    if (s2.httpStatus === 429) {
      warnings.push("semantic_scholar_rate_limited");
    } else if (s2.error && s2.papers.length === 0) {
      warnings.push(`semantic_scholar_error:${s2.httpStatus || "unknown"}`);
    }
    if (s2.papers.length) {
      merged.push(...fromSemanticHits(s2.papers));
    }
  } catch {
    warnings.push("semantic_scholar_exception");
  }

  // 2. OpenAlex
  providersTried.push("openalex");
  try {
    const ox = await fetchOpenAlex(q, perProvider);
    merged.push(...ox);
  } catch {
    warnings.push("openalex_error");
  }

  // 3. Crossref
  providersTried.push("crossref");
  try {
    const cr = await fetchCrossref(q, perProvider);
    merged.push(...cr);
  } catch {
    warnings.push("crossref_error");
  }

  // 4. arXiv
  providersTried.push("arxiv");
  try {
    const ax = await fetchArxiv(q, perProvider);
    merged.push(...ax);
  } catch {
    warnings.push("arxiv_error");
  }

  const real = merged.filter((p) => p.source !== "search_guidance");
  const ranked = dedupeAndRank(real, q, outLimit);

  if (ranked.length === 0) {
    return {
      papers: buildSearchGuidance(query, fields),
      providersTried,
      warnings,
    };
  }

  return { papers: ranked, providersTried, warnings };
}
