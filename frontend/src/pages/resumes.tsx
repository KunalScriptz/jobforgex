import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";

import { resumesApi } from "@/api/resumes";
import apiClient from "@/api/client";
import { baseResumeFilename } from "@/lib/filenames";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Download, Save, History, RotateCcw, LayoutList } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { LatexPreview, type LatexPreviewHandle } from "@/components/latex-preview";
import { PdfToLatexButton } from "@/components/pdf-to-latex-button";

// Convert "r,g,b" (0..1) rgb string used by LaTeX \definecolor into hex #rrggbb
function rgbTupleToHex(t: string): string {
  const parts = t.split(",").map((s) => Number(s.trim()));
  if (parts.length !== 3 || parts.some(isNaN)) return "#00a698";
  const to = (n: number) => Math.max(0, Math.min(255, Math.round(n * 255))).toString(16).padStart(2, "0");
  return `#${to(parts[0])}${to(parts[1])}${to(parts[2])}`;
}
function hexToRgbTuple(hex: string): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  return `${r.toFixed(2)},${g.toFixed(2)},${b.toFixed(2)}`;
}

function replaceDefineColor(src: string, name: string, tuple: string): string {
  const re = new RegExp(`(\\\\definecolor\\{${name}\\}\\{rgb\\}\\{)[^}]*(\\})`, "g");
  if (re.test(src)) return src.replace(re, `$1${tuple}$2`);
  return src;
}

type SectionBlock = { name: string; start: number; bodyStart: number; end: number };

/** Find all \section{...} blocks and the body ranges between them. */
function parseSections(src: string): SectionBlock[] {
  const re = /\\section\*?\s*\{([^}]+)\}/g;
  const hits: { name: string; start: number; bodyStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    hits.push({ name: m[1].trim(), start: m.index, bodyStart: m.index + m[0].length });
  }
  return hits.map((h, i) => ({
    ...h,
    end: i + 1 < hits.length ? hits[i + 1].start : src.indexOf("\\end{document}", h.bodyStart) >= 0
      ? src.indexOf("\\end{document}", h.bodyStart)
      : src.length,
  }));
}

function replaceSectionBody(src: string, block: SectionBlock, newBody: string): string {
  return src.slice(0, block.bodyStart) + "\n" + newBody.replace(/^\n+|\n+$/g, "") + "\n" + src.slice(block.end);
}

/** Watches the `dark` class on <html> and returns the matching CodeMirror theme. */
function useIsDark(): "dark" | "light" {
  const [dark, setDark] = useState<boolean>(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = document.documentElement;
    const obs = new MutationObserver(() => setDark(el.classList.contains("dark")));
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark ? "dark" : "light";
}

export default function ResumesPage() {
  const qc = useQueryClient();
  const cmTheme = useIsDark();
  const previewRef = useRef<LatexPreviewHandle>(null);
  const sectionsPreviewRef = useRef<LatexPreviewHandle>(null);

  const { data: resume } = useQuery({ queryKey: ["resume","base"], queryFn: () => resumesApi.getBaseResume() });
  const { data: versions = [] } = useQuery({
    queryKey: ["resume","versions", resume?.id],
    queryFn: () => resumesApi.listVersions(resume!.id),
    enabled: Boolean(resume?.id),
  });

  const [source, setSource] = useState("");
  const [primary, setPrimary] = useState("#00a698");
  const [secondary, setSecondary] = useState("#00008c");

  useEffect(() => {
    if (resume) {
      setSource(resume.latex_source);
      setPrimary(rgbTupleToHex(resume.primary_color ?? "0.0,0.65,0.60"));
      setSecondary(rgbTupleToHex(resume.secondary_color ?? "0.0,0.0,0.55"));
    }
  }, [resume?.id]);

  const save = useMutation({
    mutationFn: async () => {
      await resumesApi.saveBaseResume({ latex_source: source });
      if (resume) {
        await resumesApi.updateColors(resume.id, hexToRgbTuple(primary), hexToRgbTuple(secondary));
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resume"] });
      toast.success("Saved");
      previewRef.current?.compile();
      sectionsPreviewRef.current?.compile();
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Ctrl+S / Cmd+S to save
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!save.isPending) save.mutate();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  function applyColors(next: { primary?: string; secondary?: string }) {
    let src = source;
    if (next.primary) { setPrimary(next.primary); src = replaceDefineColor(src, "darkturquoise", hexToRgbTuple(next.primary)); }
    if (next.secondary) { setSecondary(next.secondary); src = replaceDefineColor(src, "darkblue", hexToRgbTuple(next.secondary)); }
    setSource(src);
  }

  function download() {
    const blob = new Blob([source], { type: "application/x-tex" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = baseResumeFilename({ latex: source, ext: "tex" });
    link.click();
  }

  if (!resume) return <div className="p-6 text-sm text-muted-foreground">No base resume — finish onboarding.</div>;

  return (
    <div className="flex h-[calc(100vh-0px)] flex-col p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">Base resume</h1>
        <div className="ml-auto flex items-center gap-2">
          <PdfToLatexButton onLatex={(l) => setSource(l)} />
          <ColorButton label="Primary" value={primary} onChange={(v) => applyColors({ primary: v })} />
          <ColorButton label="Accent" value={secondary} onChange={(v) => applyColors({ secondary: v })} />
          <Button variant="outline" size="sm" onClick={download}><Download className="mr-1 h-4 w-4" />.tex</Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}><Save className="mr-1 h-4 w-4" />Save</Button>
        </div>
      </div>
      <Tabs defaultValue="split" className="flex-1">
        <TabsList>
          <TabsTrigger value="split">Editor + preview</TabsTrigger>
          <TabsTrigger value="sections"><LayoutList className="mr-1 h-4 w-4" />Sections</TabsTrigger>
          <TabsTrigger value="versions"><History className="mr-1 h-4 w-4" />Versions ({versions.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="split" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border bg-card">
              <div className="border-b p-2 text-xs font-medium text-muted-foreground">LaTeX source</div>
              <CodeMirror
                value={source}
                onChange={setSource}
                height="calc(100vh - 320px)"
                basicSetup={{ lineNumbers: true, foldGutter: true }}
                theme={cmTheme}
              />
            </div>
            <div className="overflow-hidden rounded-lg border bg-white" style={{ height: "calc(100vh - 280px)" }}>
              <LatexPreview
                ref={previewRef}
                source={source}
                auto={false}
                cacheKey={`base-resume-${resume.id}`}
                downloadFilename={baseResumeFilename({ latex: source, ext: "pdf" })}
              />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="sections" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 220px)" }}>
              <SectionsEditor source={source} onChange={setSource} />
            </div>
            <div className="overflow-hidden rounded-lg border bg-white" style={{ height: "calc(100vh - 220px)" }}>
              <LatexPreview
                ref={sectionsPreviewRef}
                source={source}
                auto={false}
                cacheKey={`base-resume-${resume.id}`}
                downloadFilename={baseResumeFilename({ latex: source, ext: "pdf" })}
              />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="versions" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Version history</CardTitle><CardDescription>Auto-saved every time you save. Restore replaces current source.</CardDescription></CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                {versions.map((v: any) => (
                  <div key={v.id} className="flex items-center justify-between rounded border p-2">
                    <div>
                      <div className="font-mono text-xs text-muted-foreground">{new Date(v.created_at).toLocaleString()}</div>
                      <div className="text-xs">{(v.latex_source ?? "").length.toLocaleString()} chars · {v.note ?? ""}</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={async () => { await apiClient.post(`/api/v1/resumes/${resume.id}/versions/${v.id}/restore`); qc.invalidateQueries({ queryKey: ["resume"] }); toast.success("Restored"); }}>
                      <RotateCcw className="mr-1 h-3 w-3" />Restore
                    </Button>
                  </div>
                ))}
                {versions.length === 0 && <div className="text-muted-foreground">No history yet.</div>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ColorButton({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
          <span className="h-4 w-4 rounded-sm border" style={{ background: value }} />
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3">
        <HexColorPicker color={value} onChange={onChange} />
        <div className="mt-2 font-mono text-xs">{value}</div>
      </PopoverContent>
    </Popover>
  );
}

// -------- Sections editor -------------------------------------------------

function SectionsEditor({ source, onChange }: { source: string; onChange: (s: string) => void }) {
  const blocks = parseSections(source);
  if (blocks.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        No <code>\section{"{"}...{"}"}</code> blocks found. Add sections in the LaTeX source
        (e.g. <code>\section{"{"}Experience{"}"}</code>) and they will appear here for editing.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">
        Edit each section's body directly. Changes flow back into the LaTeX source and the preview.
        For layout / macros, switch to <span className="font-medium">Editor + preview</span>.
      </div>
      {blocks.map((b, i) => {
        const current = parseSections(source)[i];
        const body = current ? source.slice(current.bodyStart, current.end) : "";
        return (
          <div key={i} className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <div className="text-sm font-semibold">{b.name}</div>
              <div className="text-[10px] text-muted-foreground">
                \section{"{"}{b.name}{"}"}
              </div>
            </div>
            <Textarea
              value={body}
              onChange={(e) => {
                const now = parseSections(source)[i];
                if (!now) return;
                onChange(replaceSectionBody(source, now, e.target.value));
              }}
              rows={Math.min(24, Math.max(6, body.split("\n").length + 1))}
              className="rounded-none border-0 font-mono text-xs focus-visible:ring-0"
            />
          </div>
        );
      })}
    </div>
  );
}
