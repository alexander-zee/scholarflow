import { describe, expect, it } from "vitest";
import { resolveThesisDisplayMetaForExport } from "./thesis-export-display-meta";

describe("resolveThesisDisplayMetaForExport", () => {
  it("replaces junk project title with first substantive chapter title", () => {
    const m = resolveThesisDisplayMetaForExport({
      projectTitle: "dasasds",
      projectField: "sdfafsdasadsd",
      degreeLevel: "sfdafsdafsadas",
      researchQuestion: "dasbjdasbjdasbj",
      description: null,
      chapterTitles: [
        { title: "Introduction" },
        { title: "Literature review" },
        { title: "Methodology" },
      ],
    });
    expect(m.title).toBe("Methodology");
    expect(m.field).toBe("Academic research");
    expect(m.degreeLevel).toBe("Graduate thesis");
  });
});
