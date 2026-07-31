// Client-only helper that extracts plain text and hyperlink annotations from a PDF using pdfjs-dist.
// pdf.js needs a worker; we load it from the same package via Vite's ?url import.
import * as pdfjs from "pdfjs-dist";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — Vite handles the ?url query at build time
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

(pdfjs as any).GlobalWorkerOptions.workerSrc = workerUrl;

export interface PdfLink {
  label: string;
  url: string;
}

export interface PdfExtractResult {
  text: string;
  links: PdfLink[];
}

function guessLabelFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname.replace(/\/$/, "");
    if (host.includes("linkedin")) return "LinkedIn";
    if (host.includes("github")) return "GitHub";
    if (host.includes("twitter") || host.includes("x.com")) return "Twitter";
    if (host.includes("scholar") || host.includes("google")) return "Google Scholar";
    if (path) return path.split("/").pop() || host;
    return host;
  } catch {
    return url.slice(0, 40);
  }
}

export async function extractPdfText(file: File): Promise<PdfExtractResult> {
  if (file.type && !/pdf$/i.test(file.type)) {
    throw new Error("Please upload a PDF file.");
  }
  const buf = await file.arrayBuffer();
  const doc = await (pdfjs as any).getDocument({ data: buf }).promise;
  const chunks: string[] = [];
  const allLinks: PdfLink[] = [];
  const seenUrls = new Set<string>();

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const pageText = tc.items.map((it: any) => it.str).join(" ").replace(/\s+/g, " ").trim();
    if (pageText) chunks.push(pageText);

    try {
      const annotations = await page.getAnnotations();
      for (const annot of annotations) {
        if (annot.subtype === "Link" && annot.url && !seenUrls.has(annot.url)) {
          seenUrls.add(annot.url);
          allLinks.push({ label: guessLabelFromUrl(annot.url), url: annot.url });
        }
      }
    } catch (_) { /* skip page if annotations aren't supported */ }
  }

  const text = chunks.join("\n\n").trim();
  if (text.length < 80) {
    throw new Error("Could not read text from this PDF (it may be a scanned image). Try exporting a text-based PDF or paste your resume text manually.");
  }
  return { text, links: allLinks };
}
