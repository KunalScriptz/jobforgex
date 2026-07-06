import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, AlertTriangle, FileText, RefreshCw } from "lucide-react";

import { compileLatex } from "@/lib/latex.functions";

function base64ToBlobUrl(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}

type Props = { source: string; debounceMs?: number; auto?: boolean };

export function LatexPreview({ source, debounceMs = 1200, auto = true }: Props) {
  const compile = useServerFn(compileLatex);
  const [status, setStatus] = useState<"idle" | "compiling" | "ready" | "error">("idle");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [showLog, setShowLog] = useState(false);
  const runIdRef = useRef(0);
  const lastUrlRef = useRef<string | null>(null);

  async function run() {
    if (!source || source.trim().length < 10) return;
    const myRun = ++runIdRef.current;
    setStatus("compiling");
    setErrorMsg("");
    try {
      const res = await compile({ data: { source } } as any);
      if (myRun !== runIdRef.current) return;
      const url = base64ToBlobUrl(res.pdf_base64);
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
      lastUrlRef.current = url;
      setPdfUrl(url);
      setStatus("ready");
    } catch (e: any) {
      if (myRun !== runIdRef.current) return;
      setErrorMsg(String(e?.message ?? e));
      setStatus("error");
    }
  }

  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(run, debounceMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, auto, debounceMs]);

  useEffect(() => () => { if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current); }, []);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center gap-2 border-b p-2 text-xs">
        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium text-muted-foreground">Preview (real PDF · latexonline.cc)</span>
        <span className="ml-auto flex items-center gap-2">
          {status === "compiling" && (<><Loader2 className="h-3.5 w-3.5 animate-spin" /><span>Compiling…</span></>)}
          {status === "error" && (<><AlertTriangle className="h-3.5 w-3.5 text-red-500" /><button className="underline" onClick={() => setShowLog((v) => !v)}>{showLog ? "hide" : "show error"}</button></>)}
          <button className="flex items-center gap-1 rounded border px-1.5 py-0.5 hover:bg-muted" onClick={run} disabled={status === "compiling"}>
            <RefreshCw className="h-3 w-3" />Recompile
          </button>
        </span>
      </div>
      <div className="relative flex-1 bg-neutral-100">
        {pdfUrl && (
          <iframe title="PDF preview" src={pdfUrl} className="h-full w-full border-0" />
        )}
        {!pdfUrl && status !== "error" && (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {status === "compiling" ? "Compiling first PDF…" : "Waiting for changes…"}
          </div>
        )}
        {status === "error" && !pdfUrl && (
          <div className="flex h-full items-center justify-center p-6 text-center text-xs text-red-600">
            Compile failed. Click "show error" for details.
          </div>
        )}
        {showLog && errorMsg && (
          <pre className="absolute inset-x-0 bottom-0 max-h-72 overflow-auto border-t bg-black/90 p-3 text-[11px] text-red-200">
            {errorMsg}
          </pre>
        )}
      </div>
    </div>
  );
}