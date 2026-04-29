import { THESIS_OUTLINE_BLUEPRINT_HINT } from "@/lib/thesis-prompt-standards";

type ProjectContext = {
  title: string;
  field: string;
  degreeLevel: string;
  language: string;
  researchQuestion: string;
  description?: string | null;
};

export function buildOutlinePrompt(args: {
  project: ProjectContext;
  userPrompt: string;
  referenceSnippets: string;
  integrityNotice: string;
  targetPages?: number;
  targetWordBudget?: number;
}) {
  return `
You are ThesisPilot, an AI writing coach for thesis and academic work.

Task:
- Create a thesis/project OUTLINE only (structure + goals), inspired by the user's prompt and the provided reference excerpts.
- Do NOT draft full thesis chapters or a complete manuscript.
- Do NOT encourage academic misconduct. This is guidance for the student's own writing.
- The outline must be scaled for a long-form thesis and should map to a realistic final page count.

Project context:
- Title: ${args.project.title}
- Field: ${args.project.field}
- Level: ${args.project.degreeLevel}
- Language: ${args.project.language}
- Research question: ${args.project.researchQuestion}
- Description: ${args.project.description || ""}

User prompt:
${args.userPrompt}

Length targets:
- Requested pages (approx): ${args.targetPages ?? "unknown"}
- Target total words (approx): ${args.targetWordBudget ?? "unknown"}
- Prefer enough major sections so the final draft can realistically reach this target without filler.

Reference excerpts (may be partial):
${args.referenceSnippets}

Return JSON with EXACT keys:
{
  "summary": string,
  "suggested_sections": [
    {
      "title": string,
      "purpose": string,
      "sections": [
        {
          "title": string,
          "purpose": string,
          "subsections": [
            {
              "title": string,
              "focus": string,
              "subsubsections": string[]
            }
          ]
        }
      ],
      "key_points_from_references": string[],
      "student_writing_tasks": string[],
      "target_words": number
    }
  ],
  "estimated_word_budget": number,
  "citation_notes": string[],
  "integrity_notice": string
}

Set integrity_notice to exactly:
${args.integrityNotice}

Structural requirements:
- Build a realistic thesis hierarchy, not a flat chapter list.
- Each suggested chapter must include multiple "sections" entries.
- Each "sections" entry should usually include 2-4 "subsections".
- Add "subsubsections" arrays for important technical or analytical subsections where useful.
- Do not return one broad chapter with no nested structure.
- Prefer headings similar to real university thesis tables of contents for ${args.project.degreeLevel} level work.

Econometrics / quantitative thesis depth (when the project is empirical or theoretical-quantitative):
${THESIS_OUTLINE_BLUEPRINT_HINT}
`.trim();
}
