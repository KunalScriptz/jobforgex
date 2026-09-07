import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — Vite handles the ?url query at build time
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

(pdfjs as any).GlobalWorkerOptions.workerSrc = workerUrl;

interface Props {
  pdfUrl: string;
  onSelectText?: (text: string) => void;
}

/** 2D affine matrix product: m1 × m2 (apply m2 first, then m1). */
function multiplyTransform(m1: number[], m2: number[]): number[] {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

/**
 * Renders a PDF with pdf.js (canvas) plus a transparent, selectable text layer so the
 * user can select text and have it mapped back to LaTeX source. Replaces the plain
 * <iframe> blob preview only where selectability is wanted.
 */
export function SelectablePdf({ pdfUrl, onSelectText }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;
    let doc: any = null;
    const container = containerRef.current;
    if (!container) return;

    (async () => {
      setError("");
      try {
        doc = await (pdfjs as any).getDocument({ url: pdfUrl }).promise;
        if (cancelled) return;
        container.innerHTML = "";

        const first = await doc.getPage(1);
        const base = first.getViewport({ scale: 1 });
        const scale = Math.max(1, (container.clientWidth || 800) / base.width) || 1.5;

        for (let p = 1; p <= doc.numPages; p++) {
          if (cancelled) return;
          const page = await doc.getPage(p);
          const viewport = page.getViewport({ scale });

          const wrapper = document.createElement("div");
          wrapper.className = "relative mb-3 overflow-hidden bg-white shadow";
          wrapper.style.width = `${viewport.width}px`;
          wrapper.style.height = `${viewport.height}px`;

          const canvas = document.createElement("canvas");
          canvas.className = "absolute inset-0 block";
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas 2D context unavailable");
          await page.render({ canvasContext: ctx, viewport }).promise;
          if (cancelled) return;
          wrapper.appendChild(canvas);

          // Transparent text layer: invisible but selectable; selection highlight paints
          // over the canvas text below.
          const textLayer = document.createElement("div");
          textLayer.className = "absolute inset-0";
          const textContent = await page.getTextContent();
          for (const item of textContent.items as any[]) {
            if (!item.str) continue;
            const tx = multiplyTransform(viewport.transform, item.transform);
            const angle = Math.atan2(tx[1], tx[0]);
            const fontHeight = Math.hypot(tx[2], tx[3]);
            const span = document.createElement("span");
            span.textContent = item.str;
            span.style.position = "absolute";
            span.style.left = `${tx[4]}px`;
            span.style.top = `${tx[5] - fontHeight}px`;
            span.style.fontSize = `${fontHeight}px`;
            span.style.whiteSpace = "pre";
            span.style.transformOrigin = "0% 0%";
            span.style.color = "transparent";
            if (Math.abs(angle) > 0.001) span.style.transform = `rotate(${angle}rad)`;
            textLayer.appendChild(span);
          }
          wrapper.appendChild(textLayer);
          container.appendChild(wrapper);
        }
      } catch (e) {
        if (!cancelled) setError(String((e as any)?.message ?? e));
      }
    })();

    return () => {
      cancelled = true;
      if (doc) doc.destroy().catch(() => {});
    };
  }, [pdfUrl]);

  function handleMouseUp() {
    if (!onSelectText) return;
    // Let the browser settle its selection before reading it.
    requestAnimationFrame(() => {
      const sel = window.getSelection();
      const text = (sel?.toString() ?? "").replace(/\s+/g, " ").trim();
      if (text) onSelectText(text);
    });
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-red-500">
        {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onMouseUp={handleMouseUp}
      className="flex h-full w-full flex-col items-center gap-3 overflow-auto bg-neutral-100 p-3 [&_span]:select-text dark:bg-neutral-900"
    />
  );
}
