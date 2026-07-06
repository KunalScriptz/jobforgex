// Client-only exporters for AI tool text output.
// Input is treated as Markdown so downloads render with real headings,
// bold, lists, and tables — not literal markdown syntax.

import { asBlob } from "html-docx-js-typescript";
import { marked } from "marked";

export type ExportFormat = "txt" | "pdf" | "docx";

function baseName(label: string): string {
  return label.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "document";
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function mdToHtml(md: string): string {
  marked.setOptions({ gfm: true, breaks: false });
  return marked.parse(md, { async: false }) as string;
}

function wrapHtml(bodyHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.45; color: #111; }
    h1 { font-size: 20pt; margin: 0 0 10pt; }
    h2 { font-size: 15pt; margin: 14pt 0 6pt; }
    h3 { font-size: 12pt; margin: 12pt 0 4pt; }
    p  { margin: 0 0 8pt 0; }
    ul, ol { margin: 0 0 8pt 20pt; }
    li { margin: 0 0 3pt 0; }
    code { font-family: Consolas, monospace; background: #f3f3f3; padding: 1px 3px; }
    pre { background: #f3f3f3; padding: 8pt; white-space: pre-wrap; }
    table { border-collapse: collapse; margin: 8pt 0; }
    th, td { border: 1px solid #999; padding: 4pt 8pt; }
    a { color: #1a56db; text-decoration: underline; }
    strong { font-weight: bold; }
  </style></head><body>${bodyHtml}</body></html>`;
}

function mdToPlainText(md: string): string {
  // Reasonable plain-text rendering: strip markdown syntax but preserve line
  // breaks, bullets, and headings so the .txt looks like a document.
  return md
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?|```/g, ""))
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function exportPdf(content: string, filename: string) {
  const { jsPDF } = await import("jspdf");
  const html = wrapHtml(mdToHtml(content));
  // Render into an offscreen container jsPDF.html() can consume.
  const holder = document.createElement("div");
  holder.style.position = "fixed";
  holder.style.left = "-10000px";
  holder.style.top = "0";
  holder.style.width = "612pt"; // letter width
  holder.innerHTML = html;
  document.body.appendChild(holder);
  try {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    await (doc as any).html(holder, {
      x: 54,
      y: 54,
      width: 504, // 612 - 2*54
      windowWidth: 720,
      autoPaging: "text",
    });
    doc.save(filename);
  } finally {
    holder.remove();
  }
}

async function exportDocx(content: string, filename: string) {
  const blob = (await asBlob(wrapHtml(mdToHtml(content)))) as Blob;
  triggerDownload(blob, filename);
}

export async function downloadAs(format: ExportFormat, label: string, content: string) {
  const stem = baseName(label);
  if (format === "txt") {
    triggerDownload(new Blob([mdToPlainText(content)], { type: "text/plain;charset=utf-8" }), `${stem}.txt`);
    return;
  }
  if (format === "pdf") {
    await exportPdf(content, `${stem}.pdf`);
    return;
  }
  if (format === "docx") {
    await exportDocx(content, `${stem}.docx`);
    return;
  }
}