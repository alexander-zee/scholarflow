/** Escape plain text for LaTeX (titles, notes). Not for full math-aware bodies. */
export function escapeLatex(s: string): string {
  let out = "";
  for (const c of s) {
    switch (c) {
      case "\\":
        out += "\\textbackslash{}";
        break;
      case "{":
        out += "\\{";
        break;
      case "}":
        out += "\\}";
        break;
      case "$":
        out += "\\$";
        break;
      case "&":
        out += "\\&";
        break;
      case "#":
        out += "\\#";
        break;
      case "^":
        out += "\\textasciicircum{}";
        break;
      case "_":
        out += "\\_";
        break;
      case "%":
        out += "\\%";
        break;
      case "~":
        out += "\\textasciitilde{}";
        break;
      default:
        out += c;
    }
  }
  return out;
}
