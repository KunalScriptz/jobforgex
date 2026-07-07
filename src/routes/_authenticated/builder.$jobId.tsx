import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, Undo2, Save, Sparkles, ChevronDown, ChevronRight, Plus, Trash2,
  Wand2, CheckCircle2, XCircle, Loader2, FileText,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { LatexPreview } from "@/components/latex-preview";
import {
  getOrSeedBuilder, saveBuilderContent, undoBuilder,
  analyzeJobMatch, analyzeResumeScore, generateSuggestions,
  applySuggestion, ignoreSuggestion, saveBuilderAsBase,
} from "@/lib/builder.functions";
import { getJob } from "@/lib/jobs.functions";
import type { BuilderContent } from "@/lib/builder-render.server";

export const Route = createFileRoute("/_authenticated/builder/$jobId")({
  component: BuilderPage,
});

type Tab = "editor" | "ai" | "layout";
type RightTab = "match" | "score" | "templates";

function BuilderPage() {
  const { jobId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const seedFn = useServerFn(getOrSeedBuilder);
  const saveFn = useServerFn(saveBuilderContent);
  const undoFn = useServerFn(undoBuilder);
  const matchFn = useServerFn(analyzeJobMatch);
  const scoreFn = useServerFn(analyzeResumeScore);
  const sugFn = useServerFn(generateSuggestions);
  const applyFn = useServerFn(applySuggestion);
  const ignoreFn = useServerFn(ignoreSuggestion);
  const saveAsBaseFn = useServerFn(saveBuilderAsBase);
  const getJobFn = useServerFn(getJob);

  const jobQ = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => getJobFn({ data: { id: jobId } } as any),
  });
  const builderQ = useQuery({
    queryKey: ["builder", jobId],
    queryFn: () => seedFn({ data: { job_id: jobId } } as any),
    retry: false,
  });

  const [content, setContent] = useState<BuilderContent | null>(null);
  const [tab, setTab] = useState<Tab>("editor");
  const [rightTab, setRightTab] = useState<RightTab>("match");
  const [dirty, setDirty] = useState(false);
  const seededRef = useRef(false);

  useEffect(() => {
    if (builderQ.data?.content && !seededRef.current) {
      setContent(builderQ.data.content as BuilderContent);
      seededRef.current = true;
    }
  }, [builderQ.data]);

  // Debounced autosave.
  const saveMut = useMutation({
    mutationFn: (next: BuilderContent) => saveFn({ data: { job_id: jobId, content: next } } as any),
    onSuccess: () => { setDirty(false); qc.invalidateQueries({ queryKey: ["builder", jobId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  useEffect(() => {
    if (!content || !dirty) return;
    const t = setTimeout(() => saveMut.mutate(content), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, dirty]);

  const update = (mut: (c: BuilderContent) => BuilderContent) => {
    setContent(c => (c ? mut(structuredClone(c)) : c));
    setDirty(true);
  };

  const undoMut = useMutation({
    mutationFn: () => undoFn({ data: { job_id: jobId } } as any),
    onSuccess: (r: any) => { setContent(r.content); toast.success("Undone"); },
    onError: (e: any) => toast.error(e.message),
  });
  const saveBaseMut = useMutation({
    mutationFn: () => saveAsBaseFn({ data: { job_id: jobId } } as any),
    onSuccess: () => toast.success("Saved as base resume"),
    onError: (e: any) => toast.error(e.message),
  });

  const matchMut = useMutation({
    mutationFn: () => matchFn({ data: { job_id: jobId } } as any),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["builder", jobId] }),
    onError: (e: any) => toast.error(e.message),
  });
  const scoreMut = useMutation({
    mutationFn: () => scoreFn({ data: { job_id: jobId } } as any),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["builder", jobId] }),
    onError: (e: any) => toast.error(e.message),
  });
  const sugMut = useMutation({
    mutationFn: () => sugFn({ data: { job_id: jobId } } as any),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["builder", jobId] }),
    onError: (e: any) => toast.error(e.message),
  });
  const applyMut = useMutation({
    mutationFn: (id: string) => applyFn({ data: { job_id: jobId, suggestion_id: id } } as any),
    onSuccess: (r: any) => { setContent(r.content); toast.success("Applied"); qc.invalidateQueries({ queryKey: ["builder", jobId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const ignoreMut = useMutation({
    mutationFn: (id: string) => ignoreFn({ data: { job_id: jobId, suggestion_id: id } } as any),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["builder", jobId] }),
  });

  const latex = builderQ.data?.latex_source ?? "";
  const job = jobQ.data?.job;

  return (
    <div className="flex h-screen flex-col">
        {/* Top bar */}
        <div className="flex h-12 items-center gap-3 border-b bg-card px-4 text-sm">
          <button onClick={() => navigate({ to: "/jobs" })} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="text-muted-foreground">Resume Builder</div>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          <div className="font-medium truncate">
            {job ? `${job.title} @ ${job.company}` : "Loading…"}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {saveMut.isPending && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Saving…</span>}
            {!saveMut.isPending && dirty && <span className="text-xs text-amber-500">Unsaved</span>}
            {!saveMut.isPending && !dirty && content && <span className="text-xs text-emerald-500 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Saved</span>}
            <Button variant="outline" size="sm" onClick={() => undoMut.mutate()} disabled={undoMut.isPending}>
              <Undo2 className="h-3.5 w-3.5 mr-1" />Undo
            </Button>
            <Button variant="outline" size="sm" onClick={() => saveBaseMut.mutate()} disabled={saveBaseMut.isPending}>
              <Save className="h-3.5 w-3.5 mr-1" />Save as Base
            </Button>
          </div>
        </div>

        {/* Body */}
        {builderQ.isPending || !content ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Preparing your resume from your base resume — this only happens once per job.
          </div>
        ) : (
          <div className="grid flex-1 grid-cols-[420px_1fr_380px] overflow-hidden">
            {/* LEFT */}
            <div className="flex flex-col border-r bg-card">
              <div className="flex border-b text-sm">
                <TabBtn active={tab === "ai"} onClick={() => setTab("ai")}><Sparkles className="mr-1 h-4 w-4" />AI Tailor</TabBtn>
                <TabBtn active={tab === "editor"} onClick={() => setTab("editor")}>Editor</TabBtn>
                <TabBtn active={tab === "layout"} onClick={() => setTab("layout")}>Layout & Style</TabBtn>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                {tab === "editor" && <EditorPanel content={content} update={update} />}
                {tab === "ai" && (
                  <AiTailorPanel
                    suggestions={(builderQ.data as any)?.suggestions?.suggestions ?? []}
                    onGenerate={() => sugMut.mutate()}
                    generating={sugMut.isPending}
                    onApply={(id: string) => applyMut.mutate(id)}
                    onIgnore={(id: string) => ignoreMut.mutate(id)}
                    applyingId={applyMut.variables as string | undefined}
                    isApplying={applyMut.isPending}
                  />
                )}
                {tab === "layout" && <div className="text-sm text-muted-foreground">Colors & templates coming soon.</div>}
              </div>
            </div>

            {/* CENTER */}
            <div className="flex flex-col bg-muted">
              <LatexPreview
                source={latex}
                cacheKey={`builder:${jobId}`}
                downloadFilename={`${(content.contact?.name || "resume").replace(/\s+/g, "_")}_${(job?.company ?? "job").replace(/\s+/g, "_")}.pdf`}
                debounceMs={1500}
              />
            </div>

            {/* RIGHT */}
            <div className="flex flex-col border-l bg-card">
              <div className="flex border-b text-sm">
                <TabBtn active={rightTab === "match"} onClick={() => setRightTab("match")}>Job Match</TabBtn>
                <TabBtn active={rightTab === "score"} onClick={() => setRightTab("score")}>Score</TabBtn>
                <TabBtn active={rightTab === "templates"} onClick={() => setRightTab("templates")}>Templates</TabBtn>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                {rightTab === "match" && (
                  <JobMatchPanel
                    job={job}
                    match={(builderQ.data as any)?.job_match}
                    onRun={() => matchMut.mutate()}
                    loading={matchMut.isPending}
                  />
                )}
                {rightTab === "score" && (
                  <ScorePanel
                    score={(builderQ.data as any)?.score}
                    onRun={() => scoreMut.mutate()}
                    loading={scoreMut.isPending}
                  />
                )}
                {rightTab === "templates" && <div className="text-sm text-muted-foreground">The JobForge template is currently the only one available.</div>}
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: any) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors",
        active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >{children}</button>
  );
}

// -------- Editor panel --------

function EditorPanel({ content, update }: { content: BuilderContent; update: (m: (c: BuilderContent) => BuilderContent) => void }) {
  return (
    <div className="space-y-2">
      <Section title="Target Job Title" defaultOpen>
        <Input value={content.target_title ?? ""} onChange={e => update(c => ({ ...c, target_title: e.target.value }))} placeholder="Senior Solution Architect" />
      </Section>
      <Section title="Contact" defaultOpen>
        {(["name","email","phone","location","linkedin","github","website"] as const).map(k => (
          <LabeledInput key={k} label={k} value={content.contact?.[k] ?? ""} onChange={v => update(c => ({ ...c, contact: { ...(c.contact ?? {}), [k]: v } }))} />
        ))}
      </Section>
      <Section title="About / Summary">
        <Textarea rows={4} value={content.about ?? ""} onChange={e => update(c => ({ ...c, about: e.target.value }))} />
      </Section>
      <Section title="Work Experience">
        <ListEditor
          items={content.work ?? []}
          onAdd={() => update(c => ({ ...c, work: [...(c.work ?? []), { company: "", title: "", start: "", end: "", bullets: [""] }] }))}
          onRemove={i => update(c => ({ ...c, work: (c.work ?? []).filter((_, x) => x !== i) }))}
          render={(w, i) => (
            <>
              <LabeledInput label="Company" value={w.company ?? ""} onChange={v => update(c => { c.work![i].company = v; return c; })} />
              <LabeledInput label="Title" value={w.title ?? ""} onChange={v => update(c => { c.work![i].title = v; return c; })} />
              <div className="grid grid-cols-2 gap-2">
                <LabeledInput label="Start" value={w.start ?? ""} onChange={v => update(c => { c.work![i].start = v; return c; })} />
                <LabeledInput label="End" value={w.end ?? ""} onChange={v => update(c => { c.work![i].end = v; return c; })} />
              </div>
              <LabeledInput label="Location" value={w.location ?? ""} onChange={v => update(c => { c.work![i].location = v; return c; })} />
              <BulletsEditor
                bullets={w.bullets ?? []}
                onChange={next => update(c => { c.work![i].bullets = next; return c; })}
              />
            </>
          )}
        />
      </Section>
      <Section title="Education">
        <ListEditor
          items={content.education ?? []}
          onAdd={() => update(c => ({ ...c, education: [...(c.education ?? []), { school: "", degree: "", start: "", end: "" }] }))}
          onRemove={i => update(c => ({ ...c, education: (c.education ?? []).filter((_, x) => x !== i) }))}
          render={(e, i) => (
            <>
              <LabeledInput label="School" value={e.school ?? ""} onChange={v => update(c => { c.education![i].school = v; return c; })} />
              <LabeledInput label="Degree" value={e.degree ?? ""} onChange={v => update(c => { c.education![i].degree = v; return c; })} />
              <LabeledInput label="Field" value={e.field ?? ""} onChange={v => update(c => { c.education![i].field = v; return c; })} />
              <div className="grid grid-cols-2 gap-2">
                <LabeledInput label="Start" value={e.start ?? ""} onChange={v => update(c => { c.education![i].start = v; return c; })} />
                <LabeledInput label="End" value={e.end ?? ""} onChange={v => update(c => { c.education![i].end = v; return c; })} />
              </div>
            </>
          )}
        />
      </Section>
      <Section title="Skills">
        <ListEditor
          items={content.skills ?? []}
          onAdd={() => update(c => ({ ...c, skills: [...(c.skills ?? []), { group: "", items: [] }] }))}
          onRemove={i => update(c => ({ ...c, skills: (c.skills ?? []).filter((_, x) => x !== i) }))}
          render={(s, i) => (
            <>
              <LabeledInput label="Group" value={s.group ?? ""} onChange={v => update(c => { c.skills![i].group = v; return c; })} />
              <LabeledInput
                label="Items (comma-separated)"
                value={(s.items ?? []).join(", ")}
                onChange={v => update(c => { c.skills![i].items = v.split(",").map(x => x.trim()).filter(Boolean); return c; })}
              />
            </>
          )}
        />
      </Section>
      <Section title="Projects">
        <ListEditor
          items={content.projects ?? []}
          onAdd={() => update(c => ({ ...c, projects: [...(c.projects ?? []), { name: "", bullets: [""] }] }))}
          onRemove={i => update(c => ({ ...c, projects: (c.projects ?? []).filter((_, x) => x !== i) }))}
          render={(p, i) => (
            <>
              <LabeledInput label="Name" value={p.name ?? ""} onChange={v => update(c => { c.projects![i].name = v; return c; })} />
              <LabeledInput label="Link" value={p.link ?? ""} onChange={v => update(c => { c.projects![i].link = v; return c; })} />
              <BulletsEditor bullets={p.bullets ?? []} onChange={next => update(c => { c.projects![i].bullets = next; return c; })} />
            </>
          )}
        />
      </Section>
      <Section title="Certifications">
        <ListEditor
          items={content.certifications ?? []}
          onAdd={() => update(c => ({ ...c, certifications: [...(c.certifications ?? []), { name: "", issuer: "" }] }))}
          onRemove={i => update(c => ({ ...c, certifications: (c.certifications ?? []).filter((_, x) => x !== i) }))}
          render={(cert, i) => (
            <>
              <LabeledInput label="Name" value={cert.name ?? ""} onChange={v => update(c => { c.certifications![i].name = v; return c; })} />
              <LabeledInput label="Issuer" value={cert.issuer ?? ""} onChange={v => update(c => { c.certifications![i].issuer = v; return c; })} />
              <LabeledInput label="Date" value={cert.date ?? ""} onChange={v => update(c => { c.certifications![i].date = v; return c; })} />
            </>
          )}
        />
      </Section>
      <Section title="Links">
        <ListEditor
          items={content.links ?? []}
          onAdd={() => update(c => ({ ...c, links: [...(c.links ?? []), { label: "", url: "" }] }))}
          onRemove={i => update(c => ({ ...c, links: (c.links ?? []).filter((_, x) => x !== i) }))}
          render={(l, i) => (
            <>
              <LabeledInput label="Label" value={l.label ?? ""} onChange={v => update(c => { c.links![i].label = v; return c; })} />
              <LabeledInput label="URL" value={l.url ?? ""} onChange={v => update(c => { c.links![i].url = v; return c; })} />
            </>
          )}
        />
      </Section>
    </div>
  );
}

function Section({ title, children, defaultOpen }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="rounded-md border">
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/50">
        <span className="flex items-center gap-2">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {title}
        </span>
      </button>
      {open && <div className="space-y-2 border-t p-3">{children}</div>}
    </div>
  );
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted-foreground capitalize">{label}</div>
      <Input value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function ListEditor<T>({ items, render, onAdd, onRemove }: {
  items: T[]; render: (item: T, i: number) => React.ReactNode; onAdd: () => void; onRemove: (i: number) => void;
}) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="space-y-2 rounded border p-2">
          {render(item, i)}
          <Button variant="ghost" size="sm" onClick={() => onRemove(i)} className="text-destructive"><Trash2 className="h-3.5 w-3.5 mr-1" />Remove</Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={onAdd}><Plus className="h-3.5 w-3.5 mr-1" />Add</Button>
    </div>
  );
}

function BulletsEditor({ bullets, onChange }: { bullets: string[]; onChange: (b: string[]) => void }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">Bullets</div>
      {bullets.map((b, i) => (
        <div key={i} className="flex gap-1">
          <Textarea rows={2} value={b} onChange={e => { const next = [...bullets]; next[i] = e.target.value; onChange(next); }} />
          <Button variant="ghost" size="sm" onClick={() => onChange(bullets.filter((_, x) => x !== i))}><Trash2 className="h-3 w-3" /></Button>
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={() => onChange([...bullets, ""])}><Plus className="h-3 w-3 mr-1" />Add bullet</Button>
    </div>
  );
}

// -------- AI Tailor panel --------

function AiTailorPanel({ suggestions, onGenerate, generating, onApply, onIgnore, applyingId, isApplying }: any) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Suggested edits</div>
        <Button size="sm" onClick={onGenerate} disabled={generating}>
          {generating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 mr-1" />}
          {suggestions.length ? "Re-generate" : "Generate"}
        </Button>
      </div>
      {!suggestions.length && !generating && (
        <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">
          Click Generate to get AI suggestions tailored to this job's description.
        </div>
      )}
      {suggestions.map((s: any) => (
        <div key={s.id} className="rounded border p-3 space-y-2">
          <div className="text-sm font-medium">{s.title}</div>
          <div className="text-xs text-muted-foreground">{s.body}</div>
          <div className="flex gap-1">
            {(s.tags ?? []).map((t: string) => (
              <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{t}</span>
            ))}
          </div>
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => onIgnore(s.id)}><XCircle className="h-3.5 w-3.5 mr-1" />Ignore</Button>
            <Button size="sm" onClick={() => onApply(s.id)} disabled={isApplying && applyingId === s.id}>
              {isApplying && applyingId === s.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
              Apply
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// -------- Job Match panel --------

function scoreLabel(n: number) {
  if (n >= 80) return { label: "Great", color: "bg-emerald-500" };
  if (n >= 60) return { label: "Good", color: "bg-sky-500" };
  if (n >= 40) return { label: "Fair", color: "bg-amber-500" };
  return { label: "Poor", color: "bg-red-500" };
}

function JobMatchPanel({ job, match, onRun, loading }: any) {
  if (!match) {
    return (
      <div className="space-y-3">
        {job && <div><div className="text-sm font-medium">{job.title}</div><div className="text-xs text-muted-foreground">{job.company}</div></div>}
        <Button onClick={onRun} disabled={loading} size="sm">
          {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
          Analyze match
        </Button>
      </div>
    );
  }
  const buckets = match.buckets ?? {};
  const overall = scoreLabel(match.overall ?? 0);
  return (
    <div className="space-y-3">
      {job && <div><div className="text-sm font-medium">{job.title}</div><div className="text-xs text-muted-foreground">{job.company}</div></div>}
      <div className="rounded border p-3 space-y-2">
        <div className="text-sm font-medium">{overall.label} alignment</div>
        <div className="text-xs text-muted-foreground">{match.overall_summary}</div>
        <Progress value={match.overall ?? 0} />
      </div>
      {Object.entries(buckets).map(([k, v]: any) => (
        <MatchBucket key={k} name={k} bucket={v} />
      ))}
      <Button size="sm" variant="outline" onClick={onRun} disabled={loading} className="w-full">Re-analyze</Button>
    </div>
  );
}

function MatchBucket({ name, bucket }: { name: string; bucket: any }) {
  const [open, setOpen] = useState(false);
  const score = bucket?.score ?? 0;
  const label = scoreLabel(score);
  const pretty = name.replace(/_/g, " ").replace(/\b\w/g, s => s.toUpperCase());
  return (
    <div className="rounded border">
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted/50">
        <div className="text-left">
          <div className="font-medium">{pretty} Match</div>
          <div className="text-xs text-muted-foreground italic">{bucket?.impact} Impact</div>
        </div>
        <span className={cn("rounded-full px-2 py-0.5 text-xs text-white", label.color)}>{label.label} {score}</span>
      </button>
      {open && (
        <div className="border-t p-3 space-y-2 text-xs">
          {bucket?.not_covered?.length ? (
            <div>
              <div className="mb-1 font-medium text-red-500">Not covered</div>
              <ul className="list-disc pl-5 space-y-0.5">{bucket.not_covered.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
            </div>
          ) : null}
          {bucket?.covered?.length ? (
            <div>
              <div className="mb-1 font-medium text-emerald-500">Covered</div>
              <ul className="list-disc pl-5 space-y-0.5">{bucket.covered.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
            </div>
          ) : null}
          {bucket?.resume_title && (
            <div className="text-muted-foreground">Resume title: <span className="font-medium text-foreground">{bucket.resume_title}</span></div>
          )}
        </div>
      )}
    </div>
  );
}

// -------- Score panel --------

function ScorePanel({ score, onRun, loading }: any) {
  if (!score) {
    return (
      <Button onClick={onRun} disabled={loading} size="sm">
        {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />}
        Analyze resume
      </Button>
    );
  }
  return (
    <div className="space-y-3">
      <div className="rounded border p-4 text-center">
        <div className="text-3xl font-bold">{score.overall}</div>
        <div className="text-xs text-muted-foreground">resume score</div>
      </div>
      <ScoreRow title="Section Completion" score={score.section?.score ?? 0}>
        <ul className="space-y-1 text-xs">
          {(score.section?.checks ?? []).map((c: any) => (
            <li key={c.label} className="flex justify-between">
              <span>{c.label}</span>
              <span className={c.ok ? "text-emerald-500" : "text-muted-foreground"}>{c.ok ? "Ok" : "Add"}</span>
            </li>
          ))}
        </ul>
      </ScoreRow>
      <ScoreRow title="Content Quality" score={score.content_quality?.score ?? 0}>
        <ul className="space-y-1 text-xs">
          {["metrics","no_repetitive_verbs","no_repetitive_bullets","no_buzzwords"].map(k => {
            const item = score.content_quality?.[k];
            if (!item) return null;
            return <li key={k} className="flex justify-between gap-2"><span className="capitalize">{k.replace(/_/g, " ")}</span><span className="text-emerald-500">{item.status}</span></li>;
          })}
        </ul>
      </ScoreRow>
      <ScoreRow title="Content Length" score={score.content_length?.score ?? 0}>
        <div className="text-xs text-muted-foreground">{score.content_length?.note}</div>
      </ScoreRow>
      <Button size="sm" variant="outline" onClick={onRun} disabled={loading} className="w-full">Re-analyze</Button>
    </div>
  );
}

function ScoreRow({ title, score, children }: any) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded border">
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted/50">
        <span className="font-medium">{title}</span>
        <span className="text-xs">{score}</span>
      </button>
      {open && <div className="border-t p-3">{children}</div>}
    </div>
  );
}