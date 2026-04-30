/**
 * Best-effort LaTeX body cleanup for common model math mistakes before PDF export / storage.
 * Conservative: prefer stripping broken fragments over inventing new mathematics.
 */

function stripEmptyMathDelimiters(s: string): string {
  let out = s;
  out = out.replace(/\\\(\s*\\\)/g, "");
  out = out.replace(/\\\[\s*\\\]/g, "");
  out = out.replace(/\\\(\s*_\s*t\s*\\\)/g, "");
  out = out.replace(/\\\(\s*\\\.\s*\\\)/g, "");
  // Degenerate "variable name + colon only" or empty-looking inline math (common model glitch)
  out = out.replace(/\\\(\s*[a-zA-Z]{1,3}\s*:\s*\\\)/g, "");
  out = out.replace(/\\\(\s*:\\s*\\\)/g, "");
  out = out.replace(/\\\(\s*:\s*\\\)/g, "");
  out = out.replace(/\\\(\s*_+\s*\\\)/g, "");
  return out;
}

/** Fix frequent subscript typos inside $...$ or \\( ... \\) chunks (heuristic). */
function fixCommonSubscripts(s: string): string {
  return s
    .replace(/m_t\+1\b/g, "m_{t+1}")
    .replace(/R_i,t\+1\b/g, "R_{i,t+1}")
    .replace(/R_{i},t\+1\b/g, "R_{i,t+1}");
}

function fixEmptyCiteCommands(s: string): string {
  return s
    .replace(/\\citep\s*\{\s*\}/g, "")
    .replace(/\\citet\s*\{\s*\}/g, "")
    .replace(/\\citep\{citation_needed\}/gi, "")
    .replace(/\\citet\{citation_needed\}/gi, "");
}

function stripAuthorQuestionMarks(s: string): string {
  return s.replace(/\\cite[pt]?\s*\{[^}]*\?[^}]*\}/g, "\\citep{citation_needed}");
}

/** Remove lines that look like broken display math starters. */
function stripBrokenDisplayLines(s: string): string {
  return s
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (/^\\\[\s*_t\s*=/.test(t)) return false;
      if (/^\\\[\s*\\\]?\s*$/.test(t)) return false;
      return true;
    })
    .join("\n");
}

export function sanitizeThesisLatexMath(input: string): string {
  if (!input.trim()) return input;
  let s = input;
  s = stripEmptyMathDelimiters(s);
  s = fixCommonSubscripts(s);
  s = fixEmptyCiteCommands(s);
  s = stripAuthorQuestionMarks(s);
  s = stripBrokenDisplayLines(s);
  s = s.replace(/Equation~\s*$/gm, "");
  return s;
}
