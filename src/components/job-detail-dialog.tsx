import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Sparkles, ArrowLeft, Copy, Save, Loader2, MessagesSquare, Info, Wand2,
  FileText, Building2, StickyNote, ClipboardList, FolderOpen,
} from "lucide-react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { getJob, updateJob, bulkUpdateStatus } from "@/lib/jobs.functions";
import { AI_TOOLS_META, runAiTool, saveToolOutput } from "@/lib/ai-tools.functions";

type Status = "wishlist" | "applied" | "interview" | "offer" | "rejected";
const STATUSES: Status[] = ["wishlist","applied","interview","offer","rejected"];

const ACCENT: Record<string, { chip: string; ring: string; text: string; glow: string }> = {
  indigo:  { chip: "bg-indigo-500/10 text-indigo-500",   ring: "hover:ring-indigo-500/40",   text: "text-indigo-500",   glow: "from-indigo-500/20" },
  violet:  { chip: "bg-violet-500/10 text-violet-500",   ring: "hover:ring-violet-500/40",   text: "text-violet-500",   glow: "from-violet-500/20" },
  sky:     { chip: "bg-sky-500/10 text-sky-500",         ring: "hover:ring-sky-500/40",     text: "text-sky-500",       glow: "from-sky-500/20" },
  emerald: { chip: "bg-emerald-500/10 text-emerald-500", ring: "hover:ring-emerald-500/40",  text: "text-emerald-500",  glow: "from-emerald-500/20" },
  amber:   { chip: "bg-amber-500/10 text-amber-500",     ring: "hover:ring-amber-500/40",   text: "text-amber-500",     glow: "from-amber-500/20" },
  orange:  { chip: "bg-orange-500/10 text-orange-500",   ring: "hover:ring-orange-500/40",   text: "text-orange-500",   glow: "from-orange-500/20" },
  fuchsia: { chip: "bg-fuchsia-500/10 text-fuchsia-500", ring: "hover:ring-fuchsia-500/40",  text: "text-fuchsia-500",  glow: "from-fuchsia-500/20" },
  rose:    { chip: "bg-rose-500/10 text-rose-500",       ring: "hover:ring-rose-500/40",     text: "text-rose-500",     glow: "from-rose-500/20" },
};

type Tab = "insights" | "ai" | "notes" | "documents" | "company";

export function JobDetailDialog({ jobId, open, onOpenChange }: {
  jobId: string | null; open: boolean; onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const getJobFn = useServerFn(getJob);
  const moveFn = useServerFn(bulkUpdateStatus);
  const { data, isLoading } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => getJobFn({ data: { id: jobId! } } as any),
    enabled: !!jobId && open,
  });

  const [tab, setTab] = useState<Tab>("ai");
  const [activeToolId, setActiveToolId] = useState<string | null>(null);

  const job = data?.job;
  const artifacts = data?.artifacts ?? [];

  const move = useMutation({
    mutationFn: async (status: Status) => moveFn({ data: { ids: [jobId!], status } } as any),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["jobs"] }); qc.invalidateQueries({ queryKey: ["job", jobId] }); toast.success("Moved"); },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[85vh] p-0 gap-0 overflow-hidden">
        {/* Header with glow */}
        <div className="relative border-b bg-gradient-to-br from-primary/10 via-transparent to-transparent px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {job?.company ?? "—"}
              </div>
              <h2 className="truncate text-2xl font-bold tracking-tight">
                {isLoading ? "Loading…" : (job?.title ?? "Job")}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => move.mutate(s)}
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize transition ${
                      job?.status === s
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/60 text-muted-foreground hover:bg-muted"
                    }`}
                  >{s}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-5 flex gap-1 border-b -mb-5">
            {([
              ["insights", "Insights", Info],
              ["ai", "AI Tools", Sparkles],
              ["notes", "Notes", StickyNote],
              ["documents", "Documents", FolderOpen],
              ["company", "Company", Building2],
            ] as [Tab, string, any][]).map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => { setTab(id); setActiveToolId(null); }}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition ${
                  tab === id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />{label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === "insights" && <InsightsTab job={job} />}
          {tab === "notes" && <NotesTab job={job} />}
          {tab === "documents" && <DocumentsTab artifacts={artifacts} />}
          {tab === "company" && <CompanyTab job={job} />}
          {tab === "ai" && (
            activeToolId
              ? <AiToolRunner jobId={jobId!} toolId={activeToolId} onBack={() => setActiveToolId(null)} />
              : <AiToolsGrid onPick={setActiveToolId} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Tabs ----------------

function InsightsTab({ job }: { job: any }) {
  if (!job) return null;
  return (
    <div className="space-y-4">
      <Section icon={ClipboardList} title="Job Description">
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed">
          {job.description || "No description saved."}
        </pre>
      </Section>
      {job.url && (
        <Section icon={Building2} title="Job URL">
          <a href={job.url} target="_blank" rel="noreferrer" className="break-all text-sm text-primary underline">
            {job.url}
          </a>
        </Section>
      )}
    </div>
  );
}

function NotesTab({ job }: { job: any }) {
  const [notes, setNotes] = useState(job?.notes ?? "");
  const qc = useQueryClient();
  const upd = useServerFn(updateJob);
  const save = useMutation({
    mutationFn: () => upd({ data: { id: job.id, notes } } as any),
    onSuccess: () => { toast.success("Notes saved"); qc.invalidateQueries({ queryKey: ["job", job.id] }); },
  });
  if (!job) return null;
  return (
    <div className="space-y-3">
      <Textarea rows={16} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Your private notes about this application…" />
      <Button onClick={() => save.mutate()} disabled={save.isPending}>
        <Save className="mr-1.5 h-4 w-4" /> Save notes
      </Button>
    </div>
  );
}

function DocumentsTab({ artifacts }: { artifacts: any[] }) {
  if (!artifacts.length) return <Empty text="No documents yet. Use AI Tools or Generate to create them." />;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {artifacts.map((a) => (
        <div key={a.id} className="rounded-lg border bg-card p-3">
          <div className="mb-1 flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{a.kind}</span>
          </div>
          <div className="mb-2 truncate font-mono text-xs">{a.filename}</div>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-[10px] leading-tight">
            {String(a.latex_source).slice(0, 1200)}{a.latex_source?.length > 1200 ? "\n…" : ""}
          </pre>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => downloadText(a.filename, a.latex_source)}>Download</Button>
            <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(a.latex_source); toast.success("Copied"); }}>
              <Copy className="mr-1 h-3.5 w-3.5" /> Copy
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function CompanyTab({ job }: { job: any }) {
  if (!job) return null;
  return (
    <div className="space-y-3">
      <div className="rounded-lg border p-4">
        <div className="text-xs uppercase text-muted-foreground">Company</div>
        <div className="text-lg font-semibold">{job.company}</div>
        {job.url && (
          <a href={job.url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">{job.url}</a>
        )}
      </div>
    </div>
  );
}

// ---------------- AI Tools ----------------

function AiToolsGrid({ onPick }: { onPick: (id: string) => void }) {
  const stages = useMemo(() => {
    const map: Record<string, typeof AI_TOOLS_META> = { application: [], interview: [], offer: [] };
    for (const t of AI_TOOLS_META) (map[t.stage] ??= []).push(t);
    return map;
  }, []);
  const stageMeta = [
    { id: "application", label: "Application Stage" },
    { id: "interview", label: "Interview Stage" },
    { id: "offer", label: "Offer Stage" },
  ] as const;
  return (
    <div className="space-y-6">
      {stageMeta.map((s) => (
        <div key={s.id}>
          <div className="mb-2 flex items-center gap-2">
            <MessagesSquare className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stages[s.id]?.map((t) => {
              const a = ACCENT[t.accent] ?? ACCENT.indigo;
              return (
                <button
                  key={t.id}
                  onClick={() => onPick(t.id)}
                  className={`group relative overflow-hidden rounded-xl border bg-card p-4 text-left transition
                    hover:-translate-y-0.5 hover:shadow-lg hover:ring-2 ${a.ring}`}
                >
                  <div className={`absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br ${a.glow} to-transparent opacity-70 blur-2xl transition group-hover:opacity-100`} />
                  <div className="relative">
                    <div className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg ${a.chip}`}>
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="mb-1 text-sm font-semibold leading-tight">{t.label}</div>
                    <div className="text-xs text-muted-foreground">{t.short}</div>
                    <div className={`mt-3 inline-flex items-center gap-1 text-xs font-medium ${a.text}`}>
                      Generate <span className="translate-x-0 transition group-hover:translate-x-1">→</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function AiToolRunner({ jobId, toolId, onBack }: { jobId: string; toolId: string; onBack: () => void }) {
  const tool = AI_TOOLS_META.find((t) => t.id === toolId);
  const runFn = useServerFn(runAiTool);
  const saveFn = useServerFn(saveToolOutput);
  const qc = useQueryClient();
  const [ctx, setCtx] = useState("");
  const [result, setResult] = useState<{ content: string; label: string } | null>(null);

  const run = useMutation({
    mutationFn: () => runFn({ data: { job_id: jobId, tool_id: toolId, context: ctx } } as any),
    onSuccess: (r: any) => { setResult({ content: r.content, label: r.tool_label }); qc.invalidateQueries({ queryKey: ["costs"] }); },
    onError: (e: any) => toast.error(String(e?.message ?? e).slice(0, 200)),
  });
  const save = useMutation({
    mutationFn: () => saveFn({ data: { job_id: jobId, tool_label: result!.label, content: result!.content } } as any),
    onSuccess: () => { toast.success("Saved to Documents"); qc.invalidateQueries({ queryKey: ["job", jobId] }); },
    onError: (e: any) => toast.error(String(e?.message ?? e).slice(0, 200)),
  });

  if (!tool) return null;
  const a = ACCENT[tool.accent] ?? ACCENT.indigo;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> back to tools
      </button>

      <div className="rounded-xl border bg-gradient-to-br from-card to-muted/20 p-5">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${a.chip}`}>
            <Wand2 className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold">{tool.label}</h3>
            <p className="text-sm text-muted-foreground">{tool.short}</p>
          </div>
        </div>

        {(tool.contextLabel || tool.contextChips?.length) && (
          <div className="mt-4 space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              {tool.contextLabel ?? "Extra context (optional)"}
            </label>
            <Textarea
              rows={3}
              value={ctx}
              onChange={(e) => setCtx(e.target.value)}
              placeholder={tool.contextPlaceholder ?? "Add any specific details you want the AI to use…"}
            />
            {tool.contextChips && (
              <div className="flex flex-wrap gap-1.5">
                {tool.contextChips.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCtx((v) => v ? `${v}, ${c}` : c)}
                    className="rounded-full border px-2.5 py-0.5 text-[11px] transition hover:bg-muted"
                  >{c}</button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <Button onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
            {run.isPending ? "Generating…" : (result ? "Regenerate" : "Generate")}
          </Button>
        </div>
      </div>

      {result && (
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <div className="text-sm font-semibold">{result.label}</div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(result.content); toast.success("Copied"); }}>
                <Copy className="mr-1 h-3.5 w-3.5" /> Copy
              </Button>
              <Button size="sm" variant="outline" onClick={() => save.mutate()} disabled={save.isPending}>
                <Save className="mr-1 h-3.5 w-3.5" /> Save as Document
              </Button>
            </div>
          </div>
          <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed">
            {result.content}
          </pre>
        </div>
      )}
    </div>
  );
}

// ---------------- helpers ----------------

function Section({ icon: Icon, title, children }: any) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">{text}</div>;
}

function downloadText(name: string, content: string) {
  const blob = new Blob([content], { type: "text/plain" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
}