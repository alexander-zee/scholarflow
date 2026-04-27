import mammoth from "mammoth";
import { createRequire } from "module";

const MAX_EXTRACTED_CHARS = 120_000;
const require = createRequire(import.meta.url);

function truncate(text: string) {
  if (text.length <= MAX_EXTRACTED_CHARS) return text;
  return `${text.slice(0, MAX_EXTRACTED_CHARS)}\n\n[TRUNCATED_FOR_STORAGE]`;
}

export async function extractTextFromUpload(file: File) {
  const mime = file.type || "application/octet-stream";
  const name = file.name || "upload";
  const buffer = Buffer.from(await file.arrayBuffer());

  if (mime === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
    // Use core parser file directly to avoid pdf-parse debug entrypoint on some ESM/CJS setups.
    const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
      data: Buffer,
    ) => Promise<{ text?: string }>;
    const parsed = await pdfParse(buffer);
    const text = String(parsed.text || "").trim();
    if (text.length < 40) {
      throw new Error(
        "No selectable text found in this PDF. It may be scanned/image-based. Try exporting as a text PDF or DOCX.",
      );
    }
    return truncate(text);
  }

  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.toLowerCase().endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    const text = String(result.value || "").trim();
    if (text.length < 20) {
      throw new Error("DOCX contains too little readable text.");
    }
    return truncate(text);
  }

  if (
    mime === "text/plain" ||
    mime === "text/markdown" ||
    name.toLowerCase().endsWith(".txt") ||
    name.toLowerCase().endsWith(".md")
  ) {
    const text = buffer.toString("utf8").trim();
    if (text.length < 20) {
      throw new Error("Text file is too short.");
    }
    return truncate(text);
  }

  throw new Error("Unsupported file type. Use PDF, DOCX, TXT, or MD.");
}
