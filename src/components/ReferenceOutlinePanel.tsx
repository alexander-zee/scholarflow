"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type ReferenceRow = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  textPreview: string;
};

const MAX_FILES = 5;
const MAX_FILE_BYTES = 50 * 1024 * 1024;

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
    <div className="w-full rounded-2xl border border-slate-200/70 bg-[#e9eef7] px-4 py-3.5 text-left">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-h-[36px] w-full items-center justify-between gap-4"
      >
        <div className="text-base font-medium leading-tight tracking-[0.01em] text-slate-700">{label}</div>
        <span className="text-slate-500">{expanded ? "−" : "+"}</span>
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
    <div className="w-full rounded-2xl border border-slate-200/70 bg-[#e9eef7] px-4 py-3.5 text-left">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between">
        <div className="text-base font-medium leading-tight tracking-[0.01em] text-slate-700">{label}</div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-700">{valueLabel}</span>
          <span className="text-slate-500">{expanded ? "−" : "+"}</span>
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
          className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-100 accent-[#1f9de0]"
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

  const canGenerate = useMemo(
    () => references.length > 0 && prompt.trim().length >= 20,
    [references.length, prompt],
  );
  const selectedPages = pages;
  const recommendedReferenceCount = selectedPages * 2;
  const hasEnoughReferences = references.length >= recommendedReferenceCount;
  const citationCoverageLabel =
    citationCoverage < 35 ? "Narrow" : citationCoverage < 70 ? "Balanced" : "Broad";

  function buildComposedPrompt() {
    const settingsBlock = [
      `Pages (UI setting): ${pages}`,
      `Citation style (UI setting): ${citationStyle}`,
      `Citation level (UI setting): ${citationLevel}`,
      `Citation coverage (UI setting): ${citationCoverageLabel} (${citationCoverage}%)`,
      `Document language (UI setting): ${documentLanguage}`,
      `Email on completion (UI setting): ${emailOnComplete ? "yes" : "no"}`,
    ].join("\n");
    return `${prompt.trim()}\n\n${settingsBlock}`;
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
      setError("Upload references first, then write a prompt (at least 20 characters).");
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
    if (prompt.trim().length < 20) {
      setError("Add a one-prompt instruction (at least 20 characters) before generating full draft.");
      return;
    }
    if (references.length === 0) {
      setError("Upload references first before generating full draft.");
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
    <section className="h-full bg-transparent">
      <div className="grid h-full min-h-0 items-start gap-3 lg:grid-cols-[242px_1fr]">
        <aside className="space-y-3">
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
            <select value={citationStyle} onChange={(event) => setCitationStyle(event.target.value)} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700">
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
            <select value={citationLevel} onChange={(event) => setCitationLevel(event.target.value)} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700">
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
            <select value={documentLanguage} onChange={(event) => setDocumentLanguage(event.target.value)} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700">
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
              className={`relative h-6 w-11 rounded-full border ${emailOnComplete ? "border-[#1f9de0] bg-[#1f9de0]" : "border-slate-300 bg-white"}`}
              aria-pressed={emailOnComplete}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${emailOnComplete ? "left-5" : "left-0.5"}`} />
            </button>
          </SettingRow>
        </aside>

        <div className="flex h-full min-h-0 flex-col rounded-2xl bg-[#e8edf6] p-4">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            <div className="rounded-2xl bg-white p-4">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => onPickFiles(event.target.files)}
              />

              <div
                className={`rounded-[30px] border-2 border-dashed p-10 text-center transition ${isDragging ? "border-[#1f9de0] bg-[#f1f8ff]" : "border-black bg-white"}`}
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
                <div className="mx-auto h-9 w-9 rounded-xl bg-[#1f9de0] text-center text-lg leading-9 text-white">!</div>
                <p className="mt-3 text-[2rem] font-semibold text-slate-900">Click or Drag &amp; Drop</p>
                <p className="mt-1 text-base text-slate-500">Upload up to {MAX_FILES} reference papers</p>
              </div>

              {selectedFiles.length > 0 ? (
                <div className="mt-3 space-y-1.5">
                  {selectedFiles.map((file, idx) => (
                  <div key={`${file.name}-${file.size}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                      {idx + 1}. {file.name}
                    </div>
                  ))}
                  <div className="flex justify-end gap-2 pt-1">
                    <button type="button" onClick={() => setSelectedFiles([])} className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700">
                      Reset
                    </button>
                    <button type="button" onClick={uploadReferences} disabled={busy !== null} className="rounded-full bg-[#1f9de0] px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                      {busy === "upload" ? "Uploading..." : "Upload"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            {references.length > 0 ? (
              <div className="rounded-2xl bg-white p-4">
                <p className="text-base font-semibold text-slate-900">Uploaded files</p>
                <ul className="mt-1.5 space-y-1">
                  {references.map((ref, idx) => (
                    <li key={ref.id} className="rounded bg-slate-50 px-2 py-1 text-base text-slate-700">
                      {idx + 1}. {ref.originalName}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="pt-1">
              <div className="flex items-end gap-2 rounded-2xl bg-white p-2">
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={2}
                  className="min-h-[52px] flex-1 resize-y rounded-xl border-0 bg-[#f9fbff] px-4 py-3 text-sm outline-none ring-0 focus:outline-none focus:ring-0"
                  placeholder="Please upload files..."
                  disabled={references.length === 0}
                />
                <button
                  type="button"
                  onClick={generateFullDraft}
                  disabled={busy !== null || !canGenerate}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#7ec8ef] text-white disabled:opacity-50"
                  title="Generate full draft"
                >
                  ➜
                </button>
              </div>
            </div>
          </div>

          {busy === "draft" ? (
            <div className="pt-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-[#1f9de0] transition-all" style={{ width: `${draftProgress}%` }} />
              </div>
            </div>
          ) : null}

          {message ? <p className="pt-2 text-sm font-medium text-emerald-700">{message}</p> : null}
          {error ? <p className="pt-2 text-sm font-medium text-red-600">{error}</p> : null}

          {showBottomActionBar ? (
            <div className="mt-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-[0_8px_22px_rgba(15,23,42,0.06)]">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/dashboard/projects/${projectId}/review`} className="rounded-lg bg-[#1e9ee0] px-4 py-2 text-sm font-semibold text-white">
                  Open Writing Studio
                </Link>
                <Link href={`/dashboard/projects/${projectId}/history`} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700">
                  Feedback history
                </Link>
                <a href={`/api/projects/${projectId}/export?format=pdf`} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700">
                  Export PDF
                </a>
                <a href={`/api/projects/${projectId}/export?format=txt`} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700">
                  Export TXT
                </a>
                <a href={`/api/projects/${projectId}/export?format=md`} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700">
                  Export MD
                </a>
                <a href={`/api/projects/${projectId}/export?format=tex`} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700">
                  Export LaTeX
                </a>
                <Link href={`/dashboard/projects/${projectId}/print`} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700">
                  Print
                </Link>
                <div className="ml-auto flex items-center gap-2 pr-1 text-xs text-slate-400">
                  <span className="truncate font-medium text-slate-700">{projectTitle}</span>
                  <span>•</span>
                  <span>{projectLanguage}</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
