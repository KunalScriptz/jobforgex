// Client-only exporters for AI tool text output.
// Supported formats: txt, pdf, docx.

import { asBlob } from "html-docx-js-typescript";

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

async function exportPdf(content: string, filename: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 54;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(11);
  const lines = doc.splitTextToSize(content, maxWidth);
  const lineHeight = 15;
  let y = margin;
  for (const line of lines) {
    if (y + lineHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += lineHeight;
  }
  doc.save(filename);
}

function textToDocxHtml(content: string): string {
  const safe = content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = safe
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.4; }
    p { margin: 0 0 10pt 0; }
  </style></head><body>${paragraphs}</body></html>`;
}

async function exportDocx(content: string, filename: string) {
  const blob = (await asBlob(textToDocxHtml(content))) as Blob;
  triggerDownload(blob, filename);
}

export async function downloadAs(format: ExportFormat, label: string, content: string) {
  const stem = baseName(label);
  if (format === "txt") {
    triggerDownload(new Blob([content], { type: "text/plain;charset=utf-8" }), `${stem}.txt`);
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