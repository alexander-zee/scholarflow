import type { PaperResult } from "@/lib/paper-result";

const TTL_MS = 24 * 60 * 60 * 1000;

type Entry = { papers: PaperResult[]; providersTried: string[]; warnings: string[]; expiresAt: number };

const store = new Map<string, Entry>();

export function paperSearchCacheKey(query: string, fields: string[], limit: number): string {
  const q = query
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
  const f = [...fields].map((s) => s.trim().toLowerCase()).filter(Boolean).sort().join(",");
  return `${q}::${f}::${limit}`;
}

export function getPaperSearchCached(key: string): Entry | null {
  const row = store.get(key);
  if (!row) return null;
  if (Date.now() > row.expiresAt) {
    store.delete(key);
    return null;
  }
  return row;
}

export function setPaperSearchCached(key: string, value: Omit<Entry, "expiresAt">): void {
  if (store.size > 500) {
    const now = Date.now();
    for (const [k, v] of store) {
      if (v.expiresAt < now) store.delete(k);
    }
    if (store.size > 400) {
      const keys = [...store.keys()];
      for (const k of keys.slice(0, 200)) store.delete(k);
    }
  }
  store.set(key, { ...value, expiresAt: Date.now() + TTL_MS });
}
