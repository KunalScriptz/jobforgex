import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useState } from "react";
import { HexColorPicker } from "react-colorful";

import { getBaseResume, saveBaseResume, updateResumeColors, listVersions, restoreVersion } from "@/lib/resumes.functions";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Download, Save, History, RotateCcw } from "lucide-react";
import { LatexPreview } from "@/components/latex-preview";

export const Route = createFileRoute("/_authenticated/resumes")({ component: ResumesPage });

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

function ResumesPage() {
  const qc = useQueryClient();
  const getBase = useServerFn(getBaseResume);
  const saveFn = useServerFn(saveBaseResume);
  const saveColors = useServerFn(updateResumeColors);
  const getVersions = useServerFn(listVersions);
  const restore = useServerFn(restoreVersion);

  const { data: resume } = useQuery({ queryKey: ["resume","base"], queryFn: () => getBase() });
  const { data: versions = [] } = useQuery({
    queryKey: ["resume","versions", resume?.id],
    queryFn: () => getVersions({ data: { resume_id: resume!.id } } as any),
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
    mutationFn: async () => saveFn({ data: { latex_source: source, primary_color: hexToRgbTuple(primary), secondary_color: hexToRgbTuple(secondary) } } as any),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["resume"] }); toast.success("Saved"); },
    onError: (e: any) => toast.error(e.message),
  });

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
    link.download = "base_resume.tex";
    link.click();
  }

  if (!resume) return <div className="p-6 text-sm text-muted-foreground">No base resume — finish onboarding.</div>;

  return (
    <div className="flex h-[calc(100vh-0px)] flex-col p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">Base resume</h1>
        <div className="ml-auto flex items-center gap-2">
          <ColorButton label="Primary" value={primary} onChange={(v) => applyColors({ primary: v })} />
          <ColorButton label="Accent" value={secondary} onChange={(v) => applyColors({ secondary: v })} />
          <Button variant="outline" size="sm" onClick={download}><Download className="mr-1 h-4 w-4" />.tex</Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}><Save className="mr-1 h-4 w-4" />Save</Button>
        </div>
      </div>
      <Tabs defaultValue="split" className="flex-1">
        <TabsList>
          <TabsTrigger value="split">Editor + preview</TabsTrigger>
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
                theme={useIsDark()}
              />
            </div>
            <div className="overflow-hidden rounded-lg border bg-white" style={{ height: "calc(100vh - 280px)" }}>
              <LatexPreview source={source} />
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
                    <Button size="sm" variant="outline" onClick={async () => { await restore({ data: { version_id: v.id } } as any); qc.invalidateQueries({ queryKey: ["resume"] }); toast.success("Restored"); }}>
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

