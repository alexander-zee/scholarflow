import mammoth from "mammoth";
import { createRequire } from "module";

const MAX_EXTRACTED_CHARS = 120_000;
const require = createRequire(import.meta.url);

function sanitizeExtractedText(text: string) {
  return text
    .replace(/\u0000/g, "") // remove null bytes (Postgres UTF-8 rejects these)
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, " ") // normalize other control chars
    .replace(/\s+\n/g, "\n")
    .trim();
}

function truncate(text: string) {
  if (text.length <= MAX_EXTRACTED_CHARS) return text;
  return `${text.slice(0, MAX_EXTRACTED_CHARS)}\n\n[TRUNCATED_FOR_STORAGE]`;
}

export async function extractTextFromUpload(file: File) {
  const mime = file.type || "application/octet-stream";
  const name = file.name || "upload";
  const lowerName = name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (mime === "application/pdf" || lowerName.endsWith(".pdf")) {
    try {
      // Use core parser file directly to avoid pdf-parse debug entrypoint on some ESM/CJS setups.
      const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
        data: Buffer,
      ) => Promise<{ text?: string }>;
      const parsed = await pdfParse(buffer);
      const text = sanitizeExtractedText(String(parsed.text || ""));
      if (text.length >= 10) {
        return truncate(text);
      }
    } catch {
      // Fall through to a permissive placeholder so uploads are still accepted.
    }

    return truncate(
      `[PDF_IMPORTED]\nfilename: ${name}\nnote: Text extraction was limited for this file (likely scanned or non-selectable text).`,
    );
  }

  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      const text = sanitizeExtractedText(String(result.value || ""));
      if (text.length >= 20) {
        return truncate(text);
      }
    } catch {
      // Fall through to permissive placeholder for Word documents.
    }

    return truncate(
      `[DOCX_IMPORTED]\nfilename: ${name}\nnote: Text extraction was limited for this Word file.`,
    );
  }

  if (mime === "application/msword" || lowerName.endsWith(".doc")) {
    return truncate(
      `[DOC_IMPORTED]\nfilename: ${name}\nnote: Legacy .doc was accepted, but direct extraction is limited. Prefer .docx for best results.`,
    );
  }

  if (
    mime === "text/plain" ||
    mime === "text/markdown" ||
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".md")
  ) {
    const text = sanitizeExtractedText(buffer.toString("utf8"));
    if (text.length < 20) {
      throw new Error("Text file is too short.");
    }
    return truncate(text);
  }

  throw new Error("Unsupported file type. Use PDF or Word files (.pdf, .docx, .doc).");
}
