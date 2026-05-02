/**
 * Second-pass deterministic repairs when the first LaTeX compile fails.
 * Conservative: only remove/fix patterns that commonly break engines.
 */

/** Balance common amsmath environments if counts are off (often from truncated model output). */
function balanceEnvironment(body: string, env: string): string {
  const begin = new RegExp(`\\\\begin\\{${env}\\*?\\}`, "gi");
  const end = new RegExp(`\\\\end\\{${env}\\*?\\}`, "gi");
  const b = (body.match(begin) || []).length;
  const e = (body.match(end) || []).length;
  if (b <= e) return body;
  const missing = b - e;
  return `${body.trim()}\n${`\\end{${env}}\n`.repeat(missing)}`.trim();
}

export function repairTexForCompileRetry(tex: string): string {
  let s = tex.replace(/\0/g, "");
  s = s.replace(/\u2013|\u2014/g, "--");
  s = s.replace(/\\\[\s*\\\]/g, "");
  s = s.replace(/\\begin\{document\}([\s\S]*?)\\begin\{document\}/gi, "\\begin{document}$1");
  for (const env of ["equation", "align", "gather", "figure", "table"]) {
    s = balanceEnvironment(s, env);
  }
  return s.replace(/\n{4,}/g, "\n\n\n").trim();
}
