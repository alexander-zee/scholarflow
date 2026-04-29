export type PaperResult = {
  title: string;
  authors: string[];
  year?: number;
  abstract?: string;
  url?: string;
  pdfUrl?: string;
  doi?: string;
  citationCount?: number;
  /** Semantic Scholar corpus id (hex), when applicable */
  semanticScholarPaperId?: string;
  source: "semantic_scholar" | "openalex" | "crossref" | "arxiv" | "search_guidance";
};
