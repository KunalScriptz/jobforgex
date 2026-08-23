import { useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import CodeMirror from "@uiw/react-codemirror";
import { keymap } from "@codemirror/view";
import { StreamLanguage } from "@codemirror/language";
import { useEffect, useRef, useState } from "react";

const latexLanguage = StreamLanguage.define({
  name: "latex",
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match(/^%.*/)) return "comment";
    if (stream.match(/^\\[a-zA-Z@*]+/)) return "keyword";
    if (stream.match(/\{/)) return "bracket";
    if (stream.match(/\}/)) return "bracket";
    if (stream.match(/\[/)) return "bracket";
    if (stream.match(/\]/)) return "bracket";
    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: "%" } },
});
import { HexColorPicker } from "react-colorful";

import { resumesApi } from "@/api/resumes";
import apiClient from "@/api/client";
import { baseResumeFilename } from "@/lib/filenames";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Download, Save, History, RotateCcw, LayoutList, FileText, Plus, Star, Pencil, Trash2,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { LatexPreview, type LatexPreviewHandle } from "@/components/latex-preview";
import { PdfToLatexButton } from "@/components/pdf-to-latex-button";
import { PageTitle } from "@/components/page-title";
import TemplatePicker from "@/components/template-picker";
import {
  useResumes, useResumeVersions, useCreateTemplate, useDeleteTemplate, useSetDefaultTemplate,
} from "@/hooks/use-resumes";

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

/** Toggle % comment for selected lines on Ctrl+/. */
const toggleCommentExtension = keymap.of([{
  key: "Mod-/",
  run: ({ state, dispatch }) => {
    const changes = state.changeByRange((range) => {
      const line = state.doc.lineAt(range.from);
      const text = line.text;
      const isComment = text.trimStart().startsWith("%");
      if (isComment) {
        const idx = text.indexOf("%");
        return { range, changes: { from: line.from + idx, to: line.from + idx + 1, insert: "" } };
      } else {
        const leading = text.match(/^(\s*)/)?.[0] ?? "";
        return { range, changes: { from: line.from + leading.length, insert: "%" } };
      }
    });
    dispatch(state.update(changes, { scrollIntoView: true, userEvent: "input" }));
    return true;
  },
}]);

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
  const navigate = useNavigate();
  const qc = useQueryClient();
  const cmTheme = useIsDark();
  const previewRef = useRef<LatexPreviewHandle>(null);
  const sectionsPreviewRef = useRef<LatexPreviewHandle>(null);

  const { data: templates = [], isLoading } = useResumes();
  const [selectedId, setSelectedId] = useState("");
  const selectedTemplate = templates.find((t) => t.id === selectedId)
    ?? templates.find((t) => t.is_default)
    ?? templates[0];

  // Converge the selection onto the derived template (initial load, deletion fallback).
  useEffect(() => {
    if (selectedTemplate && selectedTemplate.id !== selectedId) setSelectedId(selectedTemplate.id);
  }, [selectedTemplate?.id, selectedId]);

  const { data: versions = [] } = useResumeVersions(selectedTemplate?.id ?? "");
  const deleteMut = useDeleteTemplate();
  const setDefaultMut = useSetDefaultTemplate();
  const renameMut = useMutation({
    mutationFn: ({ resumeId, name }: { resumeId: string; name: string }) =>
      resumesApi.updateTemplate(resumeId, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resumes"] });
      toast.success("Renamed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [source, setSource] = useState("");
  const [primary, setPrimary] = useState("#00a698");
  const [secondary, setSecondary] = useState("#00008c");
  const [editingName, setEditingName] = useState(false);

  useEffect(() => {
    if (selectedTemplate) {
      setSource(selectedTemplate.latex_source);
      setPrimary(rgbTupleToHex(selectedTemplate.primary_color ?? "0.0,0.65,0.60"));
      setSecondary(rgbTupleToHex(selectedTemplate.secondary_color ?? "0.0,0.0,0.55"));
    }
  }, [selectedTemplate?.id]);

  const save = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) throw new Error("No template selected");
      await resumesApi.updateTemplate(selectedTemplate.id, {
        latex_source: source,
        primary_color: hexToRgbTuple(primary),
        secondary_color: hexToRgbTuple(secondary),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resumes"] });
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

  if (!isLoading && templates.length === 0) return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <FileText className="h-10 w-10 text-muted-foreground" />
      <div className="text-sm font-medium">No resume templates found</div>
      <p className="max-w-sm text-xs text-muted-foreground">
        Upload your resume to start tailoring. You can paste LaTeX or import a PDF.
      </p>
      <Button onClick={() => navigate("/onboarding")}>
        Complete your setup
      </Button>
    </div>
  );

  if (!selectedTemplate) return null;

  return (
    <div className="flex h-[calc(100vh-0px)] flex-col p-6">
      <PageTitle title="Resume templates" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">Resume templates</h1>
        <div className="ml-auto flex items-center gap-2">
          <PdfToLatexButton onLatex={(l) => setSource(l)} />
          <ColorButton label="Primary" value={primary} onChange={(v) => applyColors({ primary: v })} />
          <ColorButton label="Accent" value={secondary} onChange={(v) => applyColors({ secondary: v })} />
          <Button variant="outline" size="sm" onClick={download}><Download className="mr-1 h-4 w-4" />.tex</Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}><Save className="mr-1 h-4 w-4" />Save</Button>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="w-64">
          <TemplatePicker value={selectedId} onChange={setSelectedId} templates={templates} />
        </div>
        {editingName ? (
          <Input
            autoFocus
            defaultValue={selectedTemplate.name}
            className="h-8 w-48"
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setEditingName(false);
            }}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== selectedTemplate.name) {
                renameMut.mutate({ resumeId: selectedTemplate.id, name: v });
              }
              setEditingName(false);
            }}
          />
        ) : (
          <Button variant="outline" size="sm" onClick={() => setEditingName(true)} title="Rename template">
            {selectedTemplate.name}
            <Pencil className="ml-1.5 h-3 w-3" />
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={selectedTemplate.is_default || setDefaultMut.isPending}
          onClick={() =>
            setDefaultMut.mutate(selectedTemplate.id, {
              onSuccess: () => toast.success("Default template updated"),
              onError: (e: any) => toast.error(e.message),
            })
          }
          title={selectedTemplate.is_default ? "This is already the default template" : "Use this template by default"}
        >
          <Star className={`mr-1 h-4 w-4 ${selectedTemplate.is_default ? "fill-current" : ""}`} />
          {selectedTemplate.is_default ? "Default" : "Set default"}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={templates.length <= 1}
              title={templates.length <= 1 ? "Cannot delete the last template" : undefined}
            >
              <Trash2 className="mr-1 h-4 w-4" />Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete template?</AlertDialogTitle>
              <AlertDialogDescription>
                "{selectedTemplate.name}" and its version history will be permanently deleted.
                {selectedTemplate.is_default && templates.length > 1 && " Another template will become the default."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteMut.mutate(selectedTemplate.id, {
                  onSuccess: () => toast.success("Template deleted"),
                  onError: (e: any) => toast.error(e.message),
                })}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <NewTemplateDialog onCreated={(id) => setSelectedId(id)} />
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
                height="calc(100vh - 380px)"
                basicSetup={{ lineNumbers: true, foldGutter: true }}
                theme={cmTheme}
                extensions={[latexLanguage, toggleCommentExtension]}
              />
            </div>
            <div className="overflow-hidden rounded-lg border bg-white" style={{ height: "calc(100vh - 340px)" }}>
              <LatexPreview
                ref={previewRef}
                source={source}
                auto={false}
                cacheKey={`template-${selectedTemplate.id}`}
                downloadFilename={baseResumeFilename({ latex: source, ext: "pdf" })}
              />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="sections" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
              <SectionsEditor source={source} onChange={setSource} />
            </div>
            <div className="overflow-hidden rounded-lg border bg-white" style={{ height: "calc(100vh - 280px)" }}>
              <LatexPreview
                ref={sectionsPreviewRef}
                source={source}
                auto={false}
                cacheKey={`template-${selectedTemplate.id}`}
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
                    <Button size="sm" variant="outline" onClick={async () => { await apiClient.post(`/api/v1/resumes/${selectedTemplate.id}/versions/${v.id}/restore`); qc.invalidateQueries({ queryKey: ["resumes"] }); toast.success("Restored"); }}>
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

function NewTemplateDialog({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [tex, setTex] = useState("");
  const create = useCreateTemplate();

  const isValid = tex.includes("\\documentclass") && tex.includes("\\begin{document}") && tex.includes("\\end{document}");

  function submit() {
    if (!isValid) {
      toast.error("LaTeX must include \\documentclass, \\begin{document}, and \\end{document}.");
      return;
    }
    create.mutate(
      { name: name.trim() || undefined, latex_source: tex },
      {
        onSuccess: (res) => {
          onCreated(res.id);
          setOpen(false);
          setName("");
          setTex("");
          toast.success("Template created");
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="mr-1 h-4 w-4" />New template</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New resume template</DialogTitle>
          <DialogDescription>
            Paste the complete LaTeX source, or import from a PDF and we'll convert it into LaTeX.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="tpl-name">Template name</Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Resume"
              maxLength={100}
              className="mt-1"
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-dashed bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">
              Only have a PDF? Import it and we'll rewrite it into LaTeX for you.
            </div>
            <PdfToLatexButton onLatex={(l) => setTex(l)} />
          </div>
          <Textarea
            className="h-64 font-mono text-xs"
            value={tex}
            onChange={(e) => setTex(e.target.value)}
            placeholder="\documentclass[letterpaper,11pt]{article}&#10;..."
          />
          {tex.length > 0 && !isValid && (
            <p className="text-xs text-amber-500">Your LaTeX must include \documentclass, \begin{"{document}"}, and \end{"{document}"} to be valid.</p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={create.isPending || !isValid}>
            {create.isPending ? "Creating…" : "Create template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
