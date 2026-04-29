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
  };
}

async function compileWithTectonic(tex: string, tectonicExe: string): Promise<Buffer | null> {
  const tmp = await mkdtemp(join(tmpdir(), "sf-tec-"));
  const texPath = join(tmp, "main.tex");
  const pdfPath = join(tmp, "main.pdf");
  try {
    await writeFile(texPath, tex, "utf8");
    await execFileAsync(tectonicExe, [texPath, `--outdir=${tmp}`], {
      cwd: tmp,
      timeout: 180_000,
      windowsHide: true,
      maxBuffer: 30 * 1024 * 1024,
    });
    if (!existsSync(pdfPath)) return null;
    return await readFile(pdfPath);
  } catch (err) {
    console.warn("[ThesisPilot] Tectonic compile failed.", err);
    return null;
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function compileWithPdflatex(tex: string, engine: string): Promise<Buffer | null> {
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
    return await readFile(join(tmp, pdfFile));
  } catch (err) {
    console.warn("[ThesisPilot] pdflatex compile failed.", err);
    return null;
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Produce a PDF from thesis LaTeX: Tectonic (bundled XeTeX) first, then optional pdflatex.
 * All work happens under os.tmpdir() (serverless-friendly).
 */
export async function compileThesisLatexToPdf(args: {
  texForTectonic: string;
  texForPdflatex: string;
}): Promise<Buffer | null> {
  const disableTectonic = /^1|true|yes$/i.test(process.env.SCHOLARFLOW_DISABLE_TECTONIC?.trim() || "");

  if (!disableTectonic) {
    const tectonicExe = resolveBundledTectonicPath();
    if (tectonicExe) {
      const pdf = await compileWithTectonic(args.texForTectonic, tectonicExe);
      if (pdf?.length) return pdf;
    }
  }

  const pdflatex = resolvePdflatexEngine();
  if (pdflatex) {
    const pdf = await compileWithPdflatex(args.texForPdflatex, pdflatex);
    if (pdf?.length) return pdf;
  }

  return null;
}
