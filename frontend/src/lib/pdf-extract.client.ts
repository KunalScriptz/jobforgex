// Client-only helper that extracts plain text from a PDF using pdfjs-dist.
// pdf.js needs a worker; we load it from the same package via Vite's ?url import.
import * as pdfjs from "pdfjs-dist";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — Vite handles the ?url query at build time
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

(pdfjs as any).GlobalWorkerOptions.workerSrc = workerUrl;

export async function extractPdfText(file: File): Promise<string> {
  if (file.type && !/pdf$/i.test(file.type)) {
    throw new Error("Please upload a PDF file.");
  }
  const buf = await file.arrayBuffer();
  const doc = await (pdfjs as any).getDocument({ data: buf }).promise;
  const chunks: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const line = tc.items.map((it: any) => it.str).join(" ").replace(/\s+/g, " ").trim();
    if (line) chunks.push(line);
  }
  const text = chunks.join("\n\n").trim();
  if (text.length < 80) {
    throw new Error("Could not read text from this PDF (it may be a scanned image). Try exporting a text-based PDF or paste your resume text manually.");
  }
  return text;
}