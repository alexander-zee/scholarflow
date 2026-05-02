import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

function bundledTectonicPackageName(): string | null {
  const pf = process.platform;
  const ar = process.arch;
  if (pf === "win32" && ar === "x64") return "@node-latex-compiler/bin-win32-x64";
  if (pf === "linux" && ar === "x64") return "@node-latex-compiler/bin-linux-x64";
  if (pf === "darwin" && ar === "arm64") return "@node-latex-compiler/bin-darwin-arm64";
  if (pf === "darwin" && ar === "x64") return "@node-latex-compiler/bin-darwin-x64";
  return null;
}

/** Path to bundled Tectonic (optional platform packages), or null. */
export function resolveBundledTectonicPath(): string | null {
  const envPath = process.env.SCHOLARFLOW_TECTONIC_PATH?.trim();
  if (envPath && existsSync(envPath)) return envPath;

  const pkgName = bundledTectonicPackageName();
  if (!pkgName) return null;
  try {
    const pkgJson = require.resolve(`${pkgName}/package.json`);
    const root = dirname(pkgJson);
    const exe = process.platform === "win32" ? "tectonic.exe" : "tectonic";
    const p = join(root, "bin", exe);
    return existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

/**
 * External pdflatex for LaTeX → PDF (second-chance path).
 * - SCHOLARFLOW_LATEX_ENGINE=0|false|off disables.
 * - Unset on Vercel: disabled (no system TeX).
 * - Otherwise defaults to `pdflatex` on PATH.
 */
export function resolvePdflatexEngine(): string | null {
  const raw = process.env.SCHOLARFLOW_LATEX_ENGINE?.trim();
  if (raw && /^(0|false|off)$/i.test(raw)) return null;
  if (raw) return raw;
  if (process.env.VERCEL) return null;
  return "pdflatex";
}

export function getPdfCompileReadiness() {
  const disableTectonic = /^1|true|yes$/i.test(process.env.SCHOLARFLOW_DISABLE_TECTONIC?.trim() || "");
  const tectonicPath = disableTectonic ? null : resolveBundledTectonicPath();
  const pdflatexEngine = resolvePdflatexEngine();
  return {
    mode: tectonicPath ? ("tectonic" as const) : pdflatexEngine ? ("pdflatex" as const) : ("fallback" as const),
    tectonicAvailable: Boolean(tectonicPath),
    pdflatexConfigured: Boolean(pdflatexEngine),
    requireLatexPdf: /^1|true|yes$/i.test(process.env.SCHOLARFLOW_REQUIRE_LATEX_PDF?.trim() || ""),
    plainFallbackDisabled: /^1|true|yes$/i.test(process.env.SCHOLARFLOW_DISABLE_PDF_PLAIN_FALLBACK?.trim() || ""),
  };
}

function extractStderrTail(err: unknown, max = 4000): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const o = err as { stderr?: Buffer | string };
  if (o.stderr === undefined || o.stderr === null) return undefined;
  const s = Buffer.isBuffer(o.stderr) ? o.stderr.toString("utf8") : String(o.stderr);
  const t = s.trim();
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

async function compileWithTectonic(tex: string, tectonicExe: string): Promise<{ pdf: Buffer | null; stderrTail?: string }> {
  const runs = Math.min(4, Math.max(1, Number.parseInt(process.env.SCHOLARFLOW_TECTONIC_RUNS || "2", 10) || 2));
  const tmp = await mkdtemp(join(tmpdir(), "sf-tec-"));
  const texPath = join(tmp, "main.tex");
  const pdfPath = join(tmp, "main.pdf");
  try {
    await writeFile(texPath, tex, "utf8");
    for (let i = 0; i < runs; i++) {
      await execFileAsync(tectonicExe, [texPath, `--outdir=${tmp}`], {
        cwd: tmp,
        timeout: 180_000,
        windowsHide: true,
        maxBuffer: 30 * 1024 * 1024,
      });
    }
    if (!existsSync(pdfPath)) return { pdf: null, stderrTail: "Tectonic finished but main.pdf missing." };
    const buf = await readFile(pdfPath);
    return { pdf: buf.length ? buf : null, stderrTail: buf.length ? undefined : "Empty PDF buffer." };
  } catch (err) {
    const stderrTail = extractStderrTail(err);
    console.warn("[ThesisPilot] Tectonic compile failed.", stderrTail ?? err);
    return { pdf: null, stderrTail };
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function compileWithPdflatex(tex: string, engine: string): Promise<{ pdf: Buffer | null; stderrTail?: string }> {
  const runs = Math.min(4, Math.max(1, Number.parseInt(process.env.SCHOLARFLOW_LATEX_RUNS || "2", 10) || 2));
  const tmp = await mkdtemp(join(tmpdir(), "sf-pdf-"));
  const base = "scholarflow-export";
  const texFile = `${base}.tex`;
  const pdfFile = `${base}.pdf`;
  try {
    await writeFile(join(tmp, texFile), tex, "utf8");
    const args = ["-interaction=nonstopmode", "-halt-on-error", "-file-line-error", texFile];
    for (let i = 0; i < runs; i++) {
      await execFileAsync(engine, args, {
        cwd: tmp,
        timeout: 120_000,
        windowsHide: true,
        maxBuffer: 30 * 1024 * 1024,
      });
    }
    const buf = await readFile(join(tmp, pdfFile));
    return { pdf: buf.length ? buf : null, stderrTail: buf.length ? undefined : "pdflatex produced empty PDF." };
  } catch (err) {
    const stderrTail = extractStderrTail(err);
    console.warn("[ThesisPilot] pdflatex compile failed.", stderrTail ?? err);
    return { pdf: null, stderrTail };
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}

export type ThesisLatexCompileStage = "primary" | "repair";

export type ThesisLatexCompileAttempt = {
  engine: "tectonic" | "pdflatex";
  stage: ThesisLatexCompileStage;
  ok: boolean;
  stderrTail?: string;
};

export type ThesisLatexCompileOutcome = {
  pdf: Buffer | null;
  engine: "tectonic" | "pdflatex" | null;
  attempts: ThesisLatexCompileAttempt[];
};

/**
 * Produce a PDF from thesis LaTeX: Tectonic first, then pdflatex; optional repaired `.tex` retry for each.
 */
export async function compileThesisLatexToPdf(args: {
  texForTectonic: string;
  texForPdflatex: string;
  /** Optional one-shot repaired sources (same shape as primary strings). */
  texForTectonicRepair?: string;
  texForPdflatexRepair?: string;
}): Promise<ThesisLatexCompileOutcome> {
  const attempts: ThesisLatexCompileAttempt[] = [];
  const disableTectonic = /^1|true|yes$/i.test(process.env.SCHOLARFLOW_DISABLE_TECTONIC?.trim() || "");
  const tectonicExe = disableTectonic ? null : resolveBundledTectonicPath();
  const pdflatex = resolvePdflatexEngine();

  const runTec = async (tex: string, stage: ThesisLatexCompileStage) => {
    if (!tectonicExe) {
      attempts.push({ engine: "tectonic", stage, ok: false, stderrTail: "Tectonic disabled or binary missing." });
      return null;
    }
    const { pdf, stderrTail } = await compileWithTectonic(tex, tectonicExe);
    attempts.push({ engine: "tectonic", stage, ok: Boolean(pdf?.length), stderrTail });
    return pdf?.length ? pdf : null;
  };

  const runPdf = async (tex: string, stage: ThesisLatexCompileStage) => {
    if (!pdflatex) {
      attempts.push({ engine: "pdflatex", stage, ok: false, stderrTail: "pdflatex not configured (e.g. Vercel or SCHOLARFLOW_LATEX_ENGINE=off)." });
      return null;
    }
    const { pdf, stderrTail } = await compileWithPdflatex(tex, pdflatex);
    attempts.push({ engine: "pdflatex", stage, ok: Boolean(pdf?.length), stderrTail });
    return pdf?.length ? pdf : null;
  };

  let p = await runTec(args.texForTectonic, "primary");
  if (p) return { pdf: p, engine: "tectonic", attempts };

  p = await runPdf(args.texForPdflatex, "primary");
  if (p) return { pdf: p, engine: "pdflatex", attempts };

  if (args.texForTectonicRepair && args.texForTectonicRepair !== args.texForTectonic) {
    p = await runTec(args.texForTectonicRepair, "repair");
    if (p) return { pdf: p, engine: "tectonic", attempts };
  }

  if (args.texForPdflatexRepair && args.texForPdflatexRepair !== args.texForPdflatex) {
    p = await runPdf(args.texForPdflatexRepair, "repair");
    if (p) return { pdf: p, engine: "pdflatex", attempts };
  }

  return { pdf: null, engine: null, attempts };
}
