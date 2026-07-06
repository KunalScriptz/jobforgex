import { useEffect, useRef, useState } from "react";
import { Loader2, AlertTriangle, FileText } from "lucide-react";

// Singleton engine loader
let enginePromise: Promise<any> | null = null;

function loadEngine(): Promise<any> {
  if (enginePromise) return enginePromise;
  enginePromise = new Promise((resolve, reject) => {
    if ((window as any).PdfTeXEngine) {
      const eng = new (window as any).PdfTeXEngine();
      eng.loadEngine().then(() => resolve(eng)).catch(reject);
      return;
    }
    const s = document.createElement("script");
    s.src = "/swiftlatex/PdfTeXEngine.js";
    s.async = true;
    s.onload = async () => {
      try {
        const eng = new (window as any).PdfTeXEngine();
        await eng.loadEngine();
        resolve(eng);
      } catch (e) { reject(e); }
    };
    s.onerror = () => reject(new Error("Failed to load LaTeX engine"));
    document.head.appendChild(s);
  });
  return enginePromise;
}

type Props = { source: string; debounceMs?: number };

export function LatexPreview({ source, debounceMs = 800 }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "compiling" | "ready" | "error">("idle");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [log, setLog] = useState<string>("");
  const [showLog, setShowLog] = useState(false);
  const runIdRef = useRef(0);
  const lastUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const myRun = ++runIdRef.current;
    if (!source || source.trim().length < 10) return;
    const t = setTimeout(async () => {
      try {
        setStatus((s) => (s === "ready" ? "compiling" : "loading"));
        const eng = await loadEngine();
        if (myRun !== runIdRef.current) return;
        setStatus("compiling");
        // reset workdir
        try { eng.flushCache?.(); } catch {}
        eng.writeMemFSFile("main.tex", source);
        eng.setEngineMainFile("main.tex");
        const result = await eng.compileLaTeX();
        if (myRun !== runIdRef.current) return;
        setLog(result?.log ?? "");
        if (result?.pdf) {
          const blob = new Blob([result.pdf], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
          lastUrlRef.current = url;
          setPdfUrl(url);
          setStatus("ready");
        } else {
          setStatus("error");
        }
      } catch (e: any) {
        if (myRun !== runIdRef.current) return;
        setLog(String(e?.message ?? e));
        setStatus("error");
      }
    }, debounceMs);
    return () => clearTimeout(t);
  }, [source, debounceMs]);

  useEffect(() => () => { if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current); }, []);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center gap-2 border-b p-2 text-xs">
        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium text-muted-foreground">Preview (real PDF · SwiftLaTeX)</span>
        <span className="ml-auto flex items-center gap-2">
          {status === "loading" && (<><Loader2 className="h-3.5 w-3.5 animate-spin" /><span>Loading engine…</span></>)}
          {status === "compiling" && (<><Loader2 className="h-3.5 w-3.5 animate-spin" /><span>Compiling…</span></>)}
          {status === "error" && (<><AlertTriangle className="h-3.5 w-3.5 text-red-500" /><button className="underline" onClick={() => setShowLog((v) => !v)}>{showLog ? "hide log" : "show log"}</button></>)}
          {status === "ready" && log && (<button className="text-muted-foreground underline" onClick={() => setShowLog((v) => !v)}>{showLog ? "hide log" : "log"}</button>)}
        </span>
      </div>
      <div className="relative flex-1 bg-neutral-100">
        {pdfUrl && (
          <iframe title="PDF preview" src={pdfUrl} className="h-full w-full border-0" />
        )}
        {!pdfUrl && status !== "error" && (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {status === "loading" ? "Loading LaTeX engine (~2MB, one-time)…" : "Waiting…"}
          </div>
        )}
        {status === "error" && !pdfUrl && (
          <div className="flex h-full items-center justify-center p-6 text-center text-xs text-red-600">
            Compile failed. Click "show log" for details.
          </div>
        )}
        {showLog && (
          <pre className="absolute inset-x-0 bottom-0 max-h-64 overflow-auto border-t bg-black/90 p-3 text-[11px] text-green-200">
            {log || "(no log)"}
          </pre>
        )}
      </div>
    </div>
  );
}