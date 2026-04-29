/**
 * In-memory cache for Semantic Scholar search responses (per Node process).
 * Avoids duplicate upstream calls for identical query/fields/limit within TTL.
 */

const TTL_MS = 18 * 60 * 1000; // 18 minutes (between 10–30 as requested)

export type CachedS2Paper = {
  paperId: string;
  title: string;
  year?: number;
  citationCount?: number;
  url: string;
  authors: string[];
  hasOpenAccessPdf: boolean;
};

const store = new Map<string, { papers: CachedS2Paper[]; expiresAt: number }>();

export function makeSemanticScholarCacheKey(query: string, fields: string[], limit: number): string {
  const q = query.toLowerCase().trim();
  const f = [...fields].map((s) => s.trim().toLowerCase()).filter(Boolean).sort().join(",");
  return `${q}::${f}::${limit}`;
}

export function getSemanticScholarCached(key: string): CachedS2Paper[] | null {
  const row = store.get(key);
  if (!row) return null;
  if (Date.now() > row.expiresAt) {
    store.delete(key);
    return null;
  }
  return row.papers;
}

export function setSemanticScholarCached(key: string, papers: CachedS2Paper[]): void {
  if (store.size > 400) {
    const now = Date.now();
    for (const [k, v] of store) {
      if (v.expiresAt < now) store.delete(k);
    }
    if (store.size > 300) {
      const keys = [...store.keys()];
      for (const k of keys.slice(0, Math.floor(keys.length / 2))) {
        store.delete(k);
      }
    }
  }
  store.set(key, { papers, expiresAt: Date.now() + TTL_MS });
}
