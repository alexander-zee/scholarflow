"use client";

import { useMemo, useRef, useState } from "react";
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
const MAX_FILE_BYTES = 12 * 1024 * 1024;

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[68px] items-center justify-between gap-4 rounded-2xl border border-slate-200/70 bg-[#e9eef7] px-4 py-3.5">
      <div className="text-base font-medium leading-tight tracking-[0.01em] text-slate-700">{label}</div>
      <div>{children}</div>
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
}: {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-[#e9eef7] px-4 py-3.5">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-base font-medium leading-tight tracking-[0.01em] text-slate-700">{label}</div>
        <span className="text-sm font-semibold text-slate-700">{valueLabel}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-100 accent-[#1f9de0]"
      />
    </div>
  );
}

export default function ReferenceOutlinePanel({
  projectId,
  references,
  hasOutline,
}: {
  projectId: string;
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

  const canGenerate = useMemo(
    () => references.length > 0 && prompt.trim().length >= 20,
    [references.length, prompt],
  );
  const selectedPages = pages;
  const recommendedReferenceCount = selectedPages * 2;
  const hasEnoughReferences = references.length >= recommendedReferenceCount;
  const citationCoverageLabel =
    citationCoverage < 35 ? "Narrow" : citationCoverage < 70 ? "Balanced" : "Broad";

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
        setError(`File too large: ${file.name} (max 12MB).`);
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
      const json = await response.json();
      if (!response.ok) {
        setError(json.error || "Upload failed.");
        return;
      }

      setMessage(`Uploaded ${json.created} reference file(s).`);
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

    const settingsBlock = [
      `Pages (UI setting): ${pages}`,
      `Citation style (UI setting): ${citationStyle}`,
      `Citation level (UI setting): ${citationLevel}`,
      `Citation coverage (UI setting): ${citationCoverageLabel} (${citationCoverage}%)`,
      `Document language (UI setting): ${documentLanguage}`,
      `Email on completion (UI setting): ${emailOnComplete ? "yes" : "no"}`,
    ].join("\n");

    const composedPrompt = `${prompt.trim()}\n\n${settingsBlock}`;

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
    if (!hasOutline) {
      setError("Generate outline sections first, then run full draft generation.");
      return;
    }
    if (prompt.trim().length < 20) {
      setError("Add a one-prompt instruction (at least 20 characters) before generating full draft.");
      return;
    }

    const settingsBlock = [
      `Pages (UI setting): ${pages}`,
      `Citation style (UI setting): ${citationStyle}`,
      `Citation level (UI setting): ${citationLevel}`,
      `Citation coverage (UI setting): ${citationCoverageLabel} (${citationCoverage}%)`,
      `Document language (UI setting): ${documentLanguage}`,
      `Email on completion (UI setting): ${emailOnComplete ? "yes" : "no"}`,
    ].join("\n");
    const composedPrompt = `${prompt.trim()}\n\n${settingsBlock}`;

    setBusy("draft");
    setDraftProgress(8);
    const tick = window.setInterval(() => {
      setDraftProgress((current) => (current >= 92 ? current : current + 7));
    }, 900);
    try {
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
          />
          <SettingRow label="Citation Style">
            <select value={citationStyle} onChange={(event) => setCitationStyle(event.target.value)} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700">
              {["APA", "IEEE", "Chicago", "Harvard", "MLA"].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </SettingRow>
          <SettingRow label="Citation Level">
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
          />
          <SettingRow label="Document Language">
            <select value={documentLanguage} onChange={(event) => setDocumentLanguage(event.target.value)} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700">
              {["English", "Dutch", "German", "French", "Spanish"].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </SettingRow>
          <SettingRow label="Email on completion">
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
            <div className="rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-slate-700">
              Please upload or import your reference papers before you can enter a prompt. The more papers you provide, the higher the output quality.
            </div>

            <div className="rounded-2xl bg-white p-4">
              <div className="mb-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-full bg-[#1f9de0] px-4 py-1.5 text-xs font-semibold text-white">
                  Upload
                </button>
                <button type="button" className="rounded-full bg-[#1f9de0] px-4 py-1.5 text-xs font-semibold text-white opacity-95" title="Coming next">
                  Semantic Scholar
                </button>
                <button type="button" className="rounded-full bg-[#1f9de0] px-4 py-1.5 text-xs font-semibold text-white opacity-95" title="Coming next">
                  Zotero
                </button>
                <button type="button" className="rounded-full bg-[#1f9de0] px-4 py-1.5 text-xs font-semibold text-white opacity-95" title="Coming next">
                  Mendeley
                </button>
              </div>

              <div className="mb-3 px-1 text-xs text-slate-600">
                {references.length} file(s) uploaded, {selectedPages} pages selected.
                {!hasEnoughReferences ? ` We recommend at least ${recommendedReferenceCount} references for stronger quality.` : " Reference target reached."}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.docx,.txt,.md,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => onPickFiles(event.target.files)}
              />

              <div
                className={`rounded-2xl border border-dashed p-10 text-center transition ${isDragging ? "border-[#1f9de0] bg-[#f1f8ff]" : "border-slate-200 bg-white"}`}
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
              >
                <div className="mx-auto h-9 w-9 rounded-xl bg-[#1f9de0] text-center text-lg leading-9 text-white">!</div>
                <p className="mt-3 text-2xl font-semibold text-slate-900">Click or Drag &amp; Drop</p>
                <p className="mt-1 text-sm text-slate-500">Upload up to {MAX_FILES} reference papers</p>
              </div>

              {selectedFiles.length > 0 ? (
                <div className="mt-3 space-y-1.5">
                  {selectedFiles.map((file, idx) => (
                    <div key={`${file.name}-${file.size}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
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
                <p className="text-xs font-semibold text-slate-900">Uploaded files</p>
                <ul className="mt-1.5 space-y-1">
                  {references.map((ref, idx) => (
                    <li key={ref.id} className="rounded bg-slate-50 px-2 py-1 text-xs text-slate-700">
                      {idx + 1}. {ref.originalName}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="pt-1">
              <div className="mb-2 flex flex-wrap gap-1.5">
                <button type="button" onClick={generateOutline} disabled={busy !== null || !canGenerate} className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50">
                  {busy === "outline" ? "Generating outline..." : "Generate outline"}
                </button>
                <button type="button" onClick={generateFullDraft} disabled={busy !== null || !hasOutline || prompt.trim().length < 20} className="rounded-full bg-[#1f9de0] px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                  {busy === "draft" ? "Generating full draft..." : "Generate Full Draft"}
                </button>
              </div>
              <div className="flex items-end gap-2 rounded-full bg-white p-1.5">
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={2}
                  className="min-h-[42px] flex-1 resize-y rounded-full border-0 bg-[#f9fbff] px-4 py-2 text-xs outline-none ring-0 focus:outline-none focus:ring-0"
                  placeholder="Please upload files..."
                  disabled={references.length === 0}
                />
                <button type="button" onClick={generateOutline} disabled={busy !== null || !canGenerate} className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#7ec8ef] text-white disabled:opacity-50" title="Generate outline">
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
        </div>
      </div>
    </section>
  );
}
