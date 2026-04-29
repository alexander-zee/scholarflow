"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, ExternalLink, Loader2, Search, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import type { PaperResult } from "@/lib/paper-result";

type ScholarListHit = {
  listKey: string;
  title: string;
  year?: number;
  citationCount?: number;
  url: string;
  authors: string[];
  source: PaperResult["source"];
  guidanceText?: string;
  raw: PaperResult;
};

const PAPER_SOURCE_LABEL: Record<PaperResult["source"], string> = {
  semantic_scholar: "Semantic Scholar",
  openalex: "OpenAlex",
  crossref: "Crossref",
  arxiv: "arXiv",
  search_guidance: "",
};

type PaperSearchApiResponse = {
  papers?: PaperResult[];
  providersTried?: string[];
  warnings?: string[];
  error?: string;
  cached?: boolean;
};

function paperResultToHit(p: PaperResult, idx: number): ScholarListHit {
  const isGuidance = p.source === "search_guidance";
  const displayUrl =
    p.url?.trim() ||
    p.pdfUrl?.trim() ||
    `https://www.google.com/search?q=${encodeURIComponent(p.title)}`;
  const listKey =
    p.semanticScholarPaperId ||
    (p.doi ? `doi:${p.doi}` : "") ||
    `${p.source}-${idx}-${p.title.slice(0, 32)}`;
  return {
    listKey,
    title: p.title,
    year: p.year,
    citationCount: p.citationCount,
    url: displayUrl,
    authors: p.authors,
    source: p.source,
    guidanceText: isGuidance ? p.abstract : undefined,
    raw: p,
  };
}

type ReferenceRow = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  textPreview: string;
};

const MAX_FILES = 200;
const MAX_FILE_BYTES = 50 * 1024 * 1024;

const SEMANTIC_SCHOLAR_FIELDS = [
  "Education",
  "Art",
  "Biology",
  "Business",
  "Chemistry",
  "Computer Science",
  "Economics",
  "Engineering",
  "Environmental Science",
  "Geography",
  "Geology",
  "History",
  "Law",
  "Materials Science",
  "Mathematics",
  "Medicine",
  "Philosophy",
  "Physics",
  "Political Science",
  "Psychology",
  "Sociology",
] as const;

const DEFAULT_SEMANTIC_FIELDS: string[] = ["Economics", "Mathematics"];

/** Left column setting cards — grey-blue ThesisPilot workspace */
const settingsCardClass =
  "w-full rounded-2xl border border-slate-300/30 bg-[#DDE4EF] px-6 py-4 text-left shadow-sm dark:border-white/10 dark:bg-slate-800/50";

const settingsLabelClass =
  "text-base font-medium leading-tight tracking-wide text-slate-800 dark:text-slate-100";

const settingsChevronClass = "text-slate-600 dark:text-slate-400";

const selectClass =
  "w-full max-w-full rounded-lg border border-slate-300/90 bg-white px-2.5 py-2 text-sm font-medium text-slate-900 outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/15 dark:border-white/14 dark:bg-slate-950/45 dark:text-slate-100 dark:backdrop-blur-md dark:focus:border-cyan-400/45";

/** White instruction / upload / Semantic Scholar cards (no inner scroll) */
const workspaceInnerWhiteClass =
  "rounded-2xl border border-blue-100 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-slate-950/45 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

const pillPrimaryClass =
  "inline-flex items-center justify-center rounded-full bg-[#176BFF] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176BFF] disabled:opacity-50";

const pillSecondaryClass =
  "inline-flex items-center justify-center rounded-full border-2 border-[#176BFF] bg-white px-6 py-2.5 text-sm font-semibold text-[#176BFF] shadow-sm transition hover:bg-blue-50/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176BFF] dark:border-sky-400 dark:bg-slate-950/40 dark:text-sky-300 dark:hover:bg-slate-900/60";

/** Main workspace column — grey-blue; grows with content; page scrolls */
const workspaceMainPanelClass =
  "flex w-full min-w-0 min-h-[620px] flex-col rounded-[28px] bg-[#DDE4EF] p-8 shadow-sm dark:border dark:border-white/10 dark:bg-slate-800/55";

function SettingRow({
  label,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={settingsCardClass}>
      <button
        type="button"
        onClick={onToggle}
        className="flex min-h-[56px] w-full items-center justify-between gap-4"
      >
        <div className={settingsLabelClass}>{label}</div>
        <span className={settingsChevronClass}>{expanded ? "−" : "+"}</span>
      </button>
      {expanded ? <div className="pt-3">{children}</div> : null}
    </div>
  );
}

function SliderRow({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
  expanded,
  onToggle,
}: {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={settingsCardClass}>
      <button type="button" onClick={onToggle} className="flex min-h-[56px] w-full items-center justify-between">
        <div className={settingsLabelClass}>{label}</div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{valueLabel}</span>
          <span className={settingsChevronClass}>{expanded ? "−" : "+"}</span>
        </div>
      </button>
      {expanded ? (
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-cyan-600 dark:bg-slate-800 dark:accent-cyan-400"
        />
      ) : null}
    </div>
  );
}

export default function ReferenceOutlinePanel({
  projectId,
  projectTitle,
  projectLanguage,
  references,
  hasOutline,
}: {
  projectId: string;
  projectTitle: string;
  projectLanguage: string;
  references: ReferenceRow[];
  hasOutline: boolean;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"upload" | "outline" | "draft" | null>(null);
  const [draftProgress, setDraftProgress] = useState(0);

  const [pages, setPages] = useState(40);
  const [citationStyle, setCitationStyle] = useState("APA");
  const [citationLevel, setCitationLevel] = useState("Standard");
  const [citationCoverage, setCitationCoverage] = useState(50);
  const [documentLanguage, setDocumentLanguage] = useState("English");
  const [emailOnComplete, setEmailOnComplete] = useState(false);
  const [expandedSetting, setExpandedSetting] = useState<string | null>(null);
  const [showBottomActionBar, setShowBottomActionBar] = useState(hasOutline);
  const [pdfModeBadge, setPdfModeBadge] = useState<"checking" | "latex" | "fallback">("checking");
  const [referenceMode, setReferenceMode] = useState<"default" | "upload" | "semantic">("default");
  const [semanticSelectedFields, setSemanticSelectedFields] = useState<string[]>(() => [...DEFAULT_SEMANTIC_FIELDS]);
  const [semanticFieldsInPrompt, setSemanticFieldsInPrompt] = useState(false);
  const [scholarQuery, setScholarQuery] = useState("");
  const [scholarSearching, setScholarSearching] = useState(false);
  const [scholarResults, setScholarResults] = useState<ScholarListHit[]>([]);
  const [importingPaperId, setImportingPaperId] = useState<string | null>(null);
  const [referenceCountDelta, setReferenceCountDelta] = useState(0);
  /** Earliest time another academic search is allowed (light client debounce). */
  const [nextS2SearchAt, setNextS2SearchAt] = useState(0);
  /** Bumps once per second while `nextS2SearchAt` is in the future so countdown UI updates. */
  const [s2Tick, setS2Tick] = useState(0);
  /** Shown when Semantic Scholar rate-limited but other providers returned hits. */

  const s2WaitSeconds = useMemo(
    () => Math.max(0, Math.ceil((nextS2SearchAt - Date.now()) / 1000)),
    [nextS2SearchAt, s2Tick],
  );

  useEffect(() => {
    if (Date.now() >= nextS2SearchAt) return;
    const id = window.setInterval(() => setS2Tick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [nextS2SearchAt]);

  const effectiveReferenceCount = references.length + referenceCountDelta;
  const promptWordCount = useMemo(() => prompt.trim().split(/\s+/).filter(Boolean).length, [prompt]);
  const canGenerate = useMemo(() => {
    const validByPrompt = promptWordCount >= 8;
    const validByTitleAndSource = projectTitle.trim().length >= 5 && effectiveReferenceCount >= 1;
    const validBySources = effectiveReferenceCount >= 3;
    return validByPrompt || validByTitleAndSource || validBySources;
  }, [promptWordCount, projectTitle, effectiveReferenceCount]);
  const selectedPages = pages;
  const recommendedReferenceCount = selectedPages * 2;
  const hasEnoughReferences = references.length >= recommendedReferenceCount;
  const citationCoverageLabel =
    citationCoverage < 35 ? "Narrow" : citationCoverage < 70 ? "Balanced" : "Broad";

  useEffect(() => {
    let cancelled = false;
    async function checkPdfMode() {
      try {
        const res = await fetch(`/api/projects/${projectId}/export?format=pdf&probe=1`, { cache: "no-store" });
        const json = (await res.json()) as { mode?: string };
        if (cancelled) return;
        setPdfModeBadge(json.mode === "tectonic" || json.mode === "pdflatex" ? "latex" : "fallback");
      } catch {
        if (cancelled) return;
        setPdfModeBadge("fallback");
      }
    }
    checkPdfMode();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    setReferenceCountDelta(0);
  }, [references.length]);

  function buildComposedPrompt() {
    const settingsBlock = [
      `Pages (UI setting): ${pages}`,
      `Citation style (UI setting): ${citationStyle}`,
      `Citation level (UI setting): ${citationLevel}`,
      `Citation coverage (UI setting): ${citationCoverageLabel} (${citationCoverage}%)`,
      `Document language (UI setting): ${documentLanguage}`,
      `Email on completion (UI setting): ${emailOnComplete ? "yes" : "no"}`,
    ].join("\n");
    const semanticBlock =
      semanticFieldsInPrompt && semanticSelectedFields.length > 0
        ? `\nAcademic search field boost (UI): ${[...semanticSelectedFields].sort().join(", ")}`
        : "";
    return `${prompt.trim()}${semanticBlock}\n\n${settingsBlock}`;
  }

  function toggleSemanticField(field: string) {
    setSemanticSelectedFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field],
    );
  }

  function resetSemanticFields() {
    setSemanticSelectedFields([...DEFAULT_SEMANTIC_FIELDS]);
  }

  function handleSemanticOk() {
    setError("");
    setSemanticFieldsInPrompt(true);
    setReferenceMode("default");
    setMessage("Field preferences saved for academic search.");
  }

  function mergeFiles(incoming: File[]) {
    const merged = [...selectedFiles, ...incoming];
    const deduped: File[] = [];
    const seen = new Set<string>();
    for (const file of merged) {
      const key = `${file.name}-${file.size}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(file);
    }
    if (deduped.length > MAX_FILES) {
      setError(`You can select up to ${MAX_FILES} files at once.`);
      return deduped.slice(0, MAX_FILES);
    }
    setError("");
    return deduped;
  }

  function onPickFiles(fileList: FileList | null) {
    if (!fileList) return;
    setSelectedFiles(mergeFiles(Array.from(fileList)));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const S2_MIN_GAP_MS = 4500;

  async function searchAcademicPapers() {
    setError("");
    setMessage("");
    const now = Date.now();
    if (now < nextS2SearchAt) {
      const s = Math.ceil((nextS2SearchAt - now) / 1000);
      setError(`Please wait ${s}s before searching again.`);
      return;
    }

    const topicFromPrompt = prompt.trim();
    const topicFromBox = scholarQuery.trim();
    const query = topicFromBox.length >= 2 ? topicFromBox : topicFromPrompt;
    const fields = semanticSelectedFields;

    if (query.length < 2) {
      setError("Enter at least 2 characters in the workspace prompt below or in the search box.");
      return;
    }

    const payload = { query, fields, limit: 20 };
    console.log("[semantic-search] query", payload);

    setScholarSearching(true);
    setScholarResults([]);
    try {
      const response = await fetch("/api/paper-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      const raw = await response.text();

      let json: PaperSearchApiResponse = {};
      try {
        json = raw ? (JSON.parse(raw) as PaperSearchApiResponse) : {};
      } catch {
        setError("Could not parse search response.");
        setNextS2SearchAt(Date.now() + S2_MIN_GAP_MS);
        return;
      }

      if (!response.ok) {
        setScholarResults([]);
        setError(json.error || `Search failed (HTTP ${response.status}).`);
        setNextS2SearchAt(Date.now() + S2_MIN_GAP_MS);
        return;
      }

      const papers = json.papers || [];
      console.log("[semantic-search] results returned", papers.length);
      const hits = papers.map((p, i) => paperResultToHit(p, i));
      setScholarResults(hits);
      setNextS2SearchAt(Date.now() + S2_MIN_GAP_MS);

      const hasRealPaper = papers.some((p) => p.source !== "search_guidance");
      if (hasRealPaper) {
        const toImport = papers.filter((p) => p.source !== "search_guidance");
        const importResponse = await fetch(`/api/projects/${projectId}/references/from-paper-search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ papers: toImport }),
        });
        const importJson = (await importResponse.json()) as {
          error?: string;
          created?: number;
          sourceIdsAdded?: string[];
        };
        if (!importResponse.ok) {
          setError(importJson.error || "Import failed after semantic search.");
        } else {
          const imported = Number(importJson.created || 0);
          setReferenceCountDelta((v) => v + imported);
          console.log("[semantic-search] import summary", {
            returned: toImport.length,
            imported,
            sourceIdsAdded: importJson.sourceIdsAdded || [],
          });
          if (imported === toImport.length) {
            setMessage(`Imported ${imported} sources from semantic search.`);
          } else {
            setMessage(`Imported ${imported} of ${toImport.length} sources. Some sources could not be fetched.`);
          }
          router.refresh();
        }
      }

      if (!hasRealPaper) {
        setMessage("No papers found across Semantic Scholar, OpenAlex, Crossref, and arXiv. See search guidance below.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Academic search failed.");
      setScholarResults([]);
      setNextS2SearchAt(Date.now() + S2_MIN_GAP_MS);
    } finally {
      setScholarSearching(false);
    }
  }

  async function importPaperHit(hit: ScholarListHit) {
    setError("");
    setMessage("");
    if (hit.source === "search_guidance") return;
    if (effectiveReferenceCount >= MAX_FILES) {
      setError(`You already have ${MAX_FILES} references for this project.`);
      return;
    }
    setImportingPaperId(hit.listKey);
    try {
      const response = await fetch(`/api/projects/${projectId}/references/from-paper-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ papers: [hit.raw] }),
      });
      const json = (await response.json()) as { error?: string; created?: number; sourceIdsAdded?: string[] };
      if (!response.ok) {
        setError(json.error || "Import failed.");
        return;
      }
      console.log("[semantic-search] single import", {
        imported: json.created || 0,
        sourceIdsAdded: json.sourceIdsAdded || [],
      });
      setReferenceCountDelta((v) => v + Number(json.created || 0));
      setMessage(`Imported ${json.created || 0} papers.`);
      router.refresh();
    } catch {
      setError("Import failed.");
    } finally {
      setImportingPaperId(null);
    }
  }

  async function importAllShownPapers() {
    setError("");
    setMessage("");
    const toImport = scholarResults.filter((h) => h.source !== "search_guidance").map((h) => h.raw);
    if (toImport.length === 0) {
      setError("No papers available to import.");
      return;
    }
    setImportingPaperId("__all__");
    try {
      const response = await fetch(`/api/projects/${projectId}/references/from-paper-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ papers: toImport }),
      });
      const json = (await response.json()) as { error?: string; created?: number; sourceIdsAdded?: string[] };
      if (!response.ok) {
        setError(json.error || "Import failed.");
        return;
      }
      console.log("[semantic-search] bulk import", {
        requested: toImport.length,
        imported: json.created || 0,
        sourceIdsAdded: json.sourceIdsAdded || [],
      });
      setReferenceCountDelta((v) => v + Number(json.created || 0));
      setMessage(`Imported ${json.created || 0} papers.`);
      router.refresh();
    } catch {
      setError("Import failed.");
    } finally {
      setImportingPaperId(null);
    }
  }

  async function uploadReferences() {
    setError("");
    setMessage("");
    if (selectedFiles.length === 0) {
      setError("Add files (click/drag) before uploading.");
      return;
    }

    for (const file of selectedFiles) {
      if (file.size > MAX_FILE_BYTES) {
        setError(`File too large: ${file.name} (max 50MB).`);
        return;
      }
    }

    setBusy("upload");
    try {
      const formData = new FormData();
      selectedFiles.forEach((file) => formData.append("files", file));

      const response = await fetch(`/api/projects/${projectId}/references`, {
        method: "POST",
        body: formData,
      });
      const raw = await response.text();
      let json: Record<string, unknown> = {};
      try {
        json = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      } catch {
        json = { error: raw || "Upload failed." };
      }
      if (!response.ok) {
        setError(String(json.error || "Upload failed."));
        return;
      }

      const warning = Array.isArray(json.errors) && json.errors.length > 0
        ? ` (${json.errors.length} skipped)`
        : "";
      setMessage(`Uploaded ${Number(json.created || 0)} reference file(s).${warning}`);
      if (Array.isArray(json.errors) && json.errors.length > 0) {
        setError(String(json.errors[0]));
      }
      setSelectedFiles([]);
      setReferenceMode("default");
      router.refresh();
    } catch {
      setError("Upload failed.");
    } finally {
      setBusy(null);
    }
  }

  async function generateOutline() {
    setError("");
    setMessage("");
    if (!canGenerate) {
      setError("Provide either a meaningful prompt (>= 8 words), a project title with one source, or at least 3 sources.");
      return;
    }
    const composedPrompt = buildComposedPrompt();

    setBusy("outline");
    try {
      const response = await fetch(`/api/projects/${projectId}/outline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: composedPrompt }),
      });
      const json = await response.json();
      if (!response.ok) {
        if (response.status === 402 && json.redirectTo) {
          window.location.href = json.redirectTo;
          return;
        }
        setError(json.error || "Outline generation failed.");
        return;
      }

      setMessage(`Created ${json.sectionsCreated} outline section(s).`);
      setPrompt("");
      setShowBottomActionBar(true);
      router.refresh();
    } catch {
      setError("Outline generation failed.");
    } finally {
      setBusy(null);
    }
  }

  async function generateFullDraft() {
    setError("");
    setMessage("");
    console.log("[full-draft-ui] validation", {
      promptWords: promptWordCount,
      effectiveSources: effectiveReferenceCount,
      canGenerate,
    });
    if (!canGenerate) {
      setError("Provide either a meaningful prompt (>= 8 words), a project title with one source, or at least 3 sources.");
      return;
    }
    const composedPrompt = buildComposedPrompt();

    setBusy("draft");
    setDraftProgress(8);
    const tick = window.setInterval(() => {
      setDraftProgress((current) => (current >= 92 ? current : current + 7));
    }, 900);
    try {
      if (!hasOutline) {
        const outlineResponse = await fetch(`/api/projects/${projectId}/outline`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: composedPrompt }),
        });
        const outlineJson = await outlineResponse.json();
        if (!outlineResponse.ok) {
          if (outlineResponse.status === 402 && outlineJson.redirectTo) {
            window.location.href = outlineJson.redirectTo;
            return;
          }
          setError(outlineJson.error || "Outline generation failed.");
          return;
        }
      }

      const response = await fetch(`/api/projects/${projectId}/full-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: composedPrompt }),
      });
      const json = await response.json();
      if (!response.ok) {
        if (response.status === 402 && json.redirectTo) {
          window.location.href = json.redirectTo;
          return;
        }
        setError(json.error || "Full draft generation failed.");
        return;
      }

      setMessage(`Generated ${json.sectionsCreated} draft chapter(s). Scroll to Document sections.`);
      setDraftProgress(100);
      setShowBottomActionBar(true);
      router.refresh();
    } catch {
      setError("Full draft generation failed.");
    } finally {
      window.clearInterval(tick);
      setBusy(null);
      window.setTimeout(() => setDraftProgress(0), 900);
    }
  }

  return (
    <section className="flex min-h-0 w-full flex-col bg-transparent">
      <div className="grid w-full grid-cols-1 items-start gap-4 lg:grid-cols-[242px_1fr] lg:gap-5">
        <aside className="min-h-0 space-y-3">
          <SliderRow
            label="Number of Pages ± 5"
            valueLabel={`${pages}`}
            min={20}
            max={80}
            step={5}
            value={pages}
            onChange={setPages}
            expanded={expandedSetting === "pages"}
            onToggle={() => setExpandedSetting((v) => (v === "pages" ? null : "pages"))}
          />
          <SettingRow
            label="Citation Style"
            expanded={expandedSetting === "style"}
            onToggle={() => setExpandedSetting((v) => (v === "style" ? null : "style"))}
          >
            <select value={citationStyle} onChange={(event) => setCitationStyle(event.target.value)} className={selectClass}>
              {["APA", "IEEE", "Chicago", "Harvard", "MLA"].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </SettingRow>
          <SettingRow
            label="Citation Level"
            expanded={expandedSetting === "level"}
            onToggle={() => setExpandedSetting((v) => (v === "level" ? null : "level"))}
          >
            <select value={citationLevel} onChange={(event) => setCitationLevel(event.target.value)} className={selectClass}>
              {["Light", "Standard", "Strict"].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </SettingRow>
          <SliderRow
            label="Citation Coverage"
            valueLabel={`${citationCoverage}%`}
            min={0}
            max={100}
            step={5}
            value={citationCoverage}
            onChange={setCitationCoverage}
            expanded={expandedSetting === "coverage"}
            onToggle={() => setExpandedSetting((v) => (v === "coverage" ? null : "coverage"))}
          />
          <SettingRow
            label="Document Language"
            expanded={expandedSetting === "language"}
            onToggle={() => setExpandedSetting((v) => (v === "language" ? null : "language"))}
          >
            <select value={documentLanguage} onChange={(event) => setDocumentLanguage(event.target.value)} className={selectClass}>
              {["English", "Dutch", "German", "French", "Spanish"].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </SettingRow>
          <SettingRow
            label="Email on completion"
            expanded={expandedSetting === "email"}
            onToggle={() => setExpandedSetting((v) => (v === "email" ? null : "email"))}
          >
            <button
              type="button"
              onClick={() => setEmailOnComplete((v) => !v)}
              className={`relative h-6 w-11 rounded-full border transition-colors ${emailOnComplete ? "border-cyan-500 bg-gradient-to-r from-cyan-500 to-sky-500 dark:border-cyan-400" : "border-slate-300 bg-white dark:border-white/15 dark:bg-slate-950/50 dark:backdrop-blur-sm"}`}
              aria-pressed={emailOnComplete}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${emailOnComplete ? "left-5" : "left-0.5"}`} />
            </button>
          </SettingRow>
        </aside>

        <div className={workspaceMainPanelClass}>
          <div className="flex flex-col gap-4">
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => onPickFiles(event.target.files)}
              />

              {referenceMode === "default" ? (
                <div className={workspaceInnerWhiteClass}>
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#176BFF] text-white shadow-md shadow-blue-900/20">
                    <BookOpen className="h-6 w-6" strokeWidth={2} aria-hidden />
                  </div>
                  <p className="mt-5 text-center text-[15px] leading-relaxed text-slate-700 dark:text-slate-200">
                    Please upload or import your reference papers before you can enter a prompt. The more papers you provide the higher the
                    output quality. ThesisPilot will automatically filter relevant content for you.
                  </p>
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                    <button type="button" className={pillPrimaryClass} onClick={() => setReferenceMode("upload")}>
                      Upload
                    </button>
                    <button type="button" className={pillSecondaryClass} onClick={() => setReferenceMode("semantic")}>
                      Semantic Scholar / Open Access Search
                    </button>
                  </div>
                </div>
              ) : null}

              {referenceMode === "upload" ? (
                <div className={workspaceInnerWhiteClass}>
                  <button
                    type="button"
                    onClick={() => setReferenceMode("default")}
                    className="mb-3 text-sm font-medium text-slate-500 underline-offset-2 hover:text-[#176BFF] hover:underline dark:text-slate-400 dark:hover:text-sky-400"
                  >
                    ← Back
                  </button>
                  <div
                    className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition ${
                      isDragging
                        ? "border-[#176BFF] bg-blue-50/90 shadow-[0_0_0_4px_rgba(23,107,255,0.12)] dark:border-sky-400 dark:bg-sky-950/30 dark:shadow-[0_0_0_4px_rgba(56,189,248,0.12)]"
                        : "border-blue-200/90 bg-slate-50/50 dark:border-white/15 dark:bg-slate-900/30"
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setIsDragging(false);
                      const dropped = Array.from(event.dataTransfer.files || []);
                      setSelectedFiles(mergeFiles(dropped));
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        fileInputRef.current?.click();
                      }
                    }}
                  >
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#176BFF] text-white shadow-md shadow-blue-900/20">
                      <Upload className="h-6 w-6" strokeWidth={2.25} aria-hidden />
                    </div>
                    <h3 className="mt-4 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Click or Drag &amp; Drop</h3>
                    <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">Upload up to {MAX_FILES} reference papers</p>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setReferenceMode("semantic");
                      }}
                      className="mt-6 inline-flex items-center gap-2 rounded-full border-2 border-[#176BFF] bg-white px-4 py-2 text-sm font-semibold text-[#176BFF] shadow-sm transition hover:bg-blue-50/90 dark:border-sky-400 dark:bg-slate-950/50 dark:text-sky-300 dark:hover:bg-slate-900/60"
                    >
                      <BookOpen className="h-4 w-4 shrink-0" aria-hidden />
                      Find papers
                    </button>
                  </div>

                  {selectedFiles.length > 0 ? (
                    <div className="mt-4 space-y-1.5">
                      {selectedFiles.map((file, idx) => (
                        <div
                          key={`${file.name}-${file.size}`}
                          className="rounded-lg border border-slate-200/90 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-white/10 dark:bg-slate-950/35 dark:text-slate-200"
                        >
                          {idx + 1}. {file.name}
                        </div>
                      ))}
                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setSelectedFiles([])}
                          className="rounded-full border border-slate-300/90 bg-white px-4 py-1.5 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 dark:border-white/14 dark:bg-slate-950/40 dark:text-slate-100 dark:hover:bg-slate-900/50"
                        >
                          Reset
                        </button>
                        <button
                          type="button"
                          onClick={uploadReferences}
                          disabled={busy !== null}
                          className="rounded-full bg-[#176BFF] px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60"
                        >
                          {busy === "upload" ? "Uploading..." : "Upload"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {referenceMode === "semantic" ? (
                <div className="rounded-2xl border border-blue-100 bg-white p-6 dark:border-white/10 dark:bg-slate-950/25">
                  <button
                    type="button"
                    onClick={() => setReferenceMode("default")}
                    className="mb-3 text-sm font-medium text-slate-500 underline-offset-2 hover:text-[#176BFF] hover:underline dark:text-slate-400 dark:hover:text-sky-400"
                  >
                    ← Back
                  </button>
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#176BFF] text-white shadow-md shadow-blue-900/20">
                    <BookOpen className="h-6 w-6" strokeWidth={2} aria-hidden />
                  </div>
                  <p className="mt-5 text-center text-[15px] leading-relaxed text-slate-700 dark:text-slate-200">
                    ThesisPilot searches Semantic Scholar, OpenAlex, Crossref, and arXiv, merges the results, and lets you import open-access PDFs
                    when a direct link is available.
                  </p>
                  <p className="mt-5 text-sm font-medium text-slate-800 dark:text-slate-100">Please select the field(s) of study to search for.</p>
                  <div className="mt-4 grid grid-cols-1 gap-x-12 gap-y-4 md:grid-cols-2 lg:grid-cols-3">
                    {SEMANTIC_SCHOLAR_FIELDS.map((field) => (
                      <label key={field} className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700 dark:text-slate-200">
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 rounded border-slate-300 text-[#176BFF] focus:ring-[#176BFF]/30 dark:border-white/20 dark:bg-slate-900"
                          checked={semanticSelectedFields.includes(field)}
                          onChange={() => toggleSemanticField(field)}
                        />
                        {field}
                      </label>
                    ))}
                  </div>
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                    <button type="button" className={pillPrimaryClass} onClick={handleSemanticOk}>
                      OK
                    </button>
                    <button type="button" className={pillSecondaryClass} onClick={resetSemanticFields}>
                      Reset
                    </button>
                  </div>

                  <div className="mt-8 border-t border-slate-200/90 pt-6 dark:border-white/10">
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
                      <input
                        type="search"
                        value={scholarQuery}
                        onChange={(e) => setScholarQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void searchAcademicPapers();
                        }}
                        placeholder="Optional keywords — leave empty to search the workspace prompt below"
                        className="min-h-[44px] flex-1 rounded-xl border border-slate-200/90 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#176BFF]/50 focus:ring-2 focus:ring-[#176BFF]/15 dark:border-white/12 dark:bg-slate-950/50 dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={() => void searchAcademicPapers()}
                        disabled={scholarSearching || busy !== null || s2WaitSeconds > 0}
                        className="inline-flex min-h-[44px] min-w-[8.5rem] items-center justify-center gap-2 rounded-full bg-[#176BFF] px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60"
                      >
                        {scholarSearching ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Search className="h-4 w-4" aria-hidden />
                        )}
                        {s2WaitSeconds > 0 ? `Wait ${s2WaitSeconds}s` : "Find papers"}
                      </button>
                    </div>
                    {scholarSearching ? (
                      <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-400">Searching academic databases…</p>
                    ) : null}
                    {scholarResults.length > 0 ? (
                      <>
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => void importAllShownPapers()}
                            disabled={importingPaperId !== null || busy !== null || effectiveReferenceCount >= MAX_FILES}
                            className="inline-flex items-center gap-2 rounded-full bg-[#176BFF] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-45"
                          >
                            {importingPaperId === "__all__" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                            Import all shown papers
                          </button>
                        </div>
                        <ul className="mt-3 space-y-2 text-left">
                        {scholarResults.map((hit) => (
                          <li
                            key={hit.listKey}
                            className={
                              hit.source === "search_guidance"
                                ? "rounded-xl border border-amber-200/90 bg-amber-50/50 p-3 dark:border-amber-400/20 dark:bg-amber-950/20"
                                : "rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-slate-950/35"
                            }
                          >
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">{hit.title}</p>
                            {hit.source !== "search_guidance" && PAPER_SOURCE_LABEL[hit.source] ? (
                              <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                {PAPER_SOURCE_LABEL[hit.source]}
                              </p>
                            ) : null}
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                              {hit.guidanceText
                                ? null
                                : [(hit.authors || []).slice(0, 2).join(", "), hit.year, hit.citationCount != null ? `${hit.citationCount} cites` : ""]
                                    .filter(Boolean)
                                    .join(" · ")}
                            </p>
                            {hit.guidanceText ? (
                              <pre className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                                {hit.guidanceText}
                              </pre>
                            ) : null}
                            <div className="mt-2 flex flex-wrap gap-2">
                              {hit.source !== "search_guidance" ? (
                                <a
                                  href={hit.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/12 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-800/60"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                                  Paper page
                                </a>
                              ) : hit.url ? (
                                <a
                                  href={hit.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/12 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-800/60"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                                  OpenAlex (catalog)
                                </a>
                              ) : null}
                              {hit.source !== "search_guidance" ? (
                                <button
                                  type="button"
                                  onClick={() => void importPaperHit(hit)}
                                  disabled={
                                    importingPaperId !== null || busy !== null || effectiveReferenceCount >= MAX_FILES
                                  }
                                  className="inline-flex items-center gap-1 rounded-lg bg-[#176BFF] px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-45"
                                >
                                  {importingPaperId === hit.listKey ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                  ) : null}
                                  Import paper
                                </button>
                              ) : null}
                            </div>
                          </li>
                        ))}
                        </ul>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {references.length > 0 ? (
                <div className={workspaceInnerWhiteClass}>
                  <p className="text-base font-semibold text-slate-900 dark:text-white">Uploaded files</p>
                  <ul className="mt-1.5 space-y-1">
                    {references.map((ref, idx) => (
                      <li
                        key={ref.id}
                        className="rounded-lg border border-transparent bg-slate-50 px-2 py-1.5 text-sm text-slate-800 dark:border-white/8 dark:bg-slate-950/30 dark:text-slate-200 dark:backdrop-blur-sm"
                      >
                        {idx + 1}. {ref.originalName}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="space-y-2 border-t border-blue-200/40 pt-4 dark:border-white/10">
              <div className="flex items-end gap-2 rounded-2xl border border-slate-200/80 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-slate-950/25 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:backdrop-blur-xl">
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={2}
                  className="min-h-[52px] flex-1 resize-y rounded-xl border border-slate-200/90 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-500 focus:border-[#176BFF]/40 focus:ring-2 focus:ring-[#176BFF]/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:placeholder:text-slate-400 dark:border-white/12 dark:bg-slate-950/40 dark:text-slate-100 dark:placeholder:text-slate-400 dark:backdrop-blur-md dark:focus:border-sky-400/40 dark:focus:ring-sky-400/12 dark:disabled:bg-slate-950/30 dark:disabled:text-slate-500 dark:disabled:placeholder:text-slate-500"
                  placeholder={
                    effectiveReferenceCount === 0
                      ? "Describe your thesis topic or run semantic search (8+ words is valid)…"
                      : "Describe scope, chapters, or tone for your thesis draft (8+ words is valid)…"
                  }
                  disabled={false}
                />
                <button
                  type="button"
                  onClick={generateFullDraft}
                  disabled={busy !== null || !canGenerate}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#176BFF] text-white shadow-md shadow-blue-900/20 transition hover:brightness-110 disabled:opacity-45"
                  title="Generate full draft"
                >
                  <span className="sr-only">Generate full draft</span>
                  <span aria-hidden className="text-base font-bold leading-none">
                    →
                  </span>
                </button>
              </div>
              <p className="px-1 text-sm font-medium text-slate-600 dark:text-slate-300">
                Full draft generation may take 15-60 minutes.
              </p>
              <p className="px-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                Sources available: {effectiveReferenceCount}
              </p>

              {busy === "draft" ? (
                <div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#176BFF] to-sky-500 transition-all dark:from-sky-400 dark:to-sky-500"
                      style={{ width: `${draftProgress}%` }}
                    />
                  </div>
                </div>
              ) : null}

              {message ? (
                <p
                  className={
                    message.includes("No papers found")
                      ? "rounded-xl border border-amber-200/90 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 dark:border-amber-400/30 dark:bg-amber-950/35 dark:text-amber-100"
                      : "text-sm font-medium text-emerald-800 dark:text-emerald-300"
                  }
                >
                  {message}
                </p>
              ) : null}
              {error ? <p className="text-sm font-medium text-red-700 dark:text-red-400">{error}</p> : null}

              {showBottomActionBar ? (
            <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-3 shadow-[0_8px_22px_rgba(15,23,42,0.06)] backdrop-blur-sm dark:border-white/10 dark:bg-slate-950/35 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_12px_40px_rgba(0,0,0,0.35)] dark:backdrop-blur-xl">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/dashboard/projects/${projectId}/review`}
                  className="rounded-lg bg-gradient-to-r from-cyan-500 to-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
                >
                  Open Writing Studio
                </Link>
                <Link
                  href={`/dashboard/projects/${projectId}/history`}
                  className="rounded-lg border border-slate-300/90 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 dark:border-white/14 dark:bg-slate-950/45 dark:text-slate-100 dark:backdrop-blur-md dark:hover:bg-slate-900/55"
                >
                  Feedback history
                </Link>
                <a
                  href={`/api/projects/${projectId}/export?format=pdf`}
                  className="rounded-lg border border-slate-300/90 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 dark:border-white/14 dark:bg-slate-950/45 dark:text-slate-100 dark:backdrop-blur-md dark:hover:bg-slate-900/55"
                >
                  Export PDF
                </a>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    pdfModeBadge === "latex"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100"
                      : pdfModeBadge === "fallback"
                        ? "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100"
                        : "bg-slate-100 text-slate-700 dark:bg-slate-950/55 dark:text-slate-300"
                  }`}
                >
                  {pdfModeBadge === "latex" ? "PDF mode: LaTeX compiled" : pdfModeBadge === "fallback" ? "PDF mode: fallback possible" : "PDF mode: checking"}
                </span>
                <a
                  href={`/api/projects/${projectId}/export?format=txt`}
                  className="rounded-lg border border-slate-300/90 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 dark:border-white/14 dark:bg-slate-950/45 dark:text-slate-100 dark:backdrop-blur-md dark:hover:bg-slate-900/55"
                >
                  Export TXT
                </a>
                <a
                  href={`/api/projects/${projectId}/export?format=md`}
                  className="rounded-lg border border-slate-300/90 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 dark:border-white/14 dark:bg-slate-950/45 dark:text-slate-100 dark:backdrop-blur-md dark:hover:bg-slate-900/55"
                >
                  Export MD
                </a>
                <a
                  href={`/api/projects/${projectId}/export?format=tex`}
                  className="rounded-lg border border-slate-300/90 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 dark:border-white/14 dark:bg-slate-950/45 dark:text-slate-100 dark:backdrop-blur-md dark:hover:bg-slate-900/55"
                >
                  Export LaTeX
                </a>
                <Link
                  href={`/dashboard/projects/${projectId}/print`}
                  className="rounded-lg border border-slate-300/90 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 dark:border-white/14 dark:bg-slate-950/45 dark:text-slate-100 dark:backdrop-blur-md dark:hover:bg-slate-900/55"
                >
                  Print
                </Link>
                <div className="ml-auto flex items-center gap-2 pr-1 text-xs text-slate-500 dark:text-slate-400">
                  <span className="truncate font-medium text-slate-800 dark:text-slate-200">{projectTitle}</span>
                  <span>•</span>
                  <span>{projectLanguage}</span>
                </div>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                <strong className="text-slate-800 dark:text-slate-200">Export PDF</strong> typesets the same thesis{" "}
                <code className="rounded bg-slate-100 px-1 text-slate-900 dark:bg-slate-800 dark:text-slate-100">report</code> source with{" "}
                <strong className="text-slate-800 dark:text-slate-200">Tectonic</strong> (bundled after{" "}
                <code className="rounded bg-slate-100 px-1 text-slate-900 dark:bg-slate-800 dark:text-slate-100">npm install</code>) when available, then{" "}
                <code className="rounded bg-slate-100 px-1 text-slate-900 dark:bg-slate-800 dark:text-slate-100">pdflatex</code> if configured. If both fail, you get a plain preview PDF. Download{" "}
                <code className="rounded bg-slate-100 px-1 text-slate-900 dark:bg-slate-800 dark:text-slate-100">.tex</code> for Overleaf / TeX Live.
              </p>
            </div>
          ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
