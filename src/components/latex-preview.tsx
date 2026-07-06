import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, AlertTriangle, FileText, RefreshCw } from "lucide-react";

import { compileLatex } from "@/lib/latex.functions";

// Module-level cache — survives component unmount so navigating away and back
// doesn't force a recompile of an unchanged source.
type CacheEntry = { source: string; pdfUrl: string };
const previewCache = new Map<string, CacheEntry>();
const DEFAULT_CACHE_KEY = "__default__";

function base64ToBlobUrl(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}

export type LatexPreviewHandle = { compile: () => Promise<void> };
type Props = { source: string; debounceMs?: number; auto?: boolean; cacheKey?: string; downloadFilename?: string };

export const LatexPreview = forwardRef<LatexPreviewHandle, Props>(function LatexPreview(
  { source, debounceMs = 1200, auto = true, cacheKey, downloadFilename },
  ref,
) {
  const compile = useServerFn(compileLatex);
  const key = cacheKey ?? DEFAULT_CACHE_KEY;
  const cached = previewCache.get(key);
  const hasCache = cached && cached.source === source;
  const [status, setStatus] = useState<"idle" | "compiling" | "ready" | "error">(hasCache ? "ready" : "idle");
  const [pdfUrl, setPdfUrl] = useState<string | null>(hasCache ? cached!.pdfUrl : null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [showLog, setShowLog] = useState(false);
  const runIdRef = useRef(0);
  const lastCompiledRef = useRef<string>(hasCache ? source : "");

  async function run() {
    if (!source || source.trim().length < 10) return;
    if (source === lastCompiledRef.current && status === "ready") return; // cache hit
    const myRun = ++runIdRef.current;
    setStatus("compiling");
    setErrorMsg("");
    try {
      const res = await compile({ data: { source } } as any);
      if (myRun !== runIdRef.current) return;
      const url = base64ToBlobUrl(res.pdf_base64);
      const prev = previewCache.get(key);
      if (prev && prev.pdfUrl !== url) URL.revokeObjectURL(prev.pdfUrl);
      previewCache.set(key, { source, pdfUrl: url });
      lastCompiledRef.current = source;
      setPdfUrl(url);
      setStatus("ready");
    } catch (e: any) {
      if (myRun !== runIdRef.current) return;
      setErrorMsg(String(e?.message ?? e));
      setStatus("error");
    }
  }

  useImperativeHandle(ref, () => ({ compile: run }), [source]);

  useEffect(() => {
    if (!auto) return;
    // Skip if we already have a valid cached render for this exact source.
    if (lastCompiledRef.current === source && pdfUrl) return;
    const t = setTimeout(run, debounceMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, auto, debounceMs]);

  // Don't revoke on unmount — the URL lives in the module cache so we can
  // reuse it when the component remounts (e.g., navigating tabs).

  const dirty = pdfUrl && source !== lastCompiledRef.current;

  function downloadPdf() {
    if (!pdfUrl) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = downloadFilename || "resume.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center gap-2 border-b p-2 text-xs">
        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium text-muted-foreground">Preview (real PDF)</span>
        <span className="ml-auto flex items-center gap-2">
          {status === "compiling" && (<><Loader2 className="h-3.5 w-3.5 animate-spin" /><span>Compiling…</span></>)}
          {status === "ready" && dirty && <span className="text-amber-500">Unsaved changes — press Save (Ctrl+S) to recompile</span>}
          {status === "error" && (
            <>
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
              <button className="font-medium text-red-500 underline underline-offset-2" onClick={() => setShowLog((v) => !v)}>
                {showLog ? "hide error" : "show error"}
              </button>
            </>
          )}
          {pdfUrl && downloadFilename && (
            <button className="flex items-center gap-1 rounded border px-1.5 py-0.5 hover:bg-muted" onClick={downloadPdf}>
              Download PDF
            </button>
          )}
          <button className="flex items-center gap-1 rounded border px-1.5 py-0.5 hover:bg-muted" onClick={run} disabled={status === "compiling"}>
            <RefreshCw className="h-3 w-3" />Recompile
          </button>
        </span>
      </div>
      <div className="relative flex-1 bg-neutral-100 dark:bg-neutral-900">
        {pdfUrl && (
          <iframe title="PDF preview" src={pdfUrl} className="h-full w-full border-0" />
        )}
        {!pdfUrl && status !== "error" && (
          <div className="flex h-full items-center justify-center text-xs text-neutral-600 dark:text-neutral-300">
            {status === "compiling" ? "Compiling first PDF…" : "Press Recompile or Save (Ctrl+S) to render."}
          </div>
        )}
        {status === "error" && !pdfUrl && (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <AlertTriangle className="h-6 w-6 text-red-500" />
            <div className="text-sm font-semibold text-red-500">Compile failed</div>
            <div className="max-w-md text-xs text-neutral-600 dark:text-neutral-300">
              {errorMsg ? firstLine(errorMsg) : "Unknown error"}
            </div>
            <button className="rounded border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-500/20"
              onClick={() => setShowLog(true)}>
              Show full error
            </button>
          </div>
        )}
        {showLog && errorMsg && (
          <pre className="absolute inset-x-0 bottom-0 max-h-72 overflow-auto border-t border-red-500/30 bg-black/95 p-3 text-[11px] text-red-200">
            {errorMsg}
          </pre>
        )}
      </div>
    </div>
  );
});

function firstLine(s: string): string {
  const line = s.split("\n").find((l) => l.trim().length > 0) ?? s;
  return line.length > 220 ? line.slice(0, 220) + "…" : line;
}