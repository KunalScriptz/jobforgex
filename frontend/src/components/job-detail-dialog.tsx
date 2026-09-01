import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Sparkles, ArrowLeft, Copy, Save, Loader2, MessagesSquare, Info, Wand2,
  FileText, Building2, StickyNote, ClipboardList, FolderOpen, Download, RefreshCw,
  AlertTriangle, CheckCircle2, Tag, Target, GraduationCap, Users,
} from "lucide-react";
import JSZip from "jszip";
import ReactMarkdown from "react-markdown";
import { Link } from "react-router-dom";
import remarkGfm from "remark-gfm";

import { Checkbox } from "@/components/ui/checkbox";
import { TailoringLoader } from "@/components/tailoring-loader";
import { PaywallDialog, isPaywallError } from "@/components/paywall-dialog";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadAs, type ExportFormat } from "@/lib/export-doc";
import { ChevronDown } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2, MessageSquare, Send } from "lucide-react";
import { Eye } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { resolveCompanyDomain } from "@/lib/company";

import apiClient from "@/api/client";
import { jobsApi, type JobDetail } from "@/api/jobs";
import { aiApi, type AtsScoreResult } from "@/api/ai";
import { resumesApi } from "@/api/resumes";
import { billingApi } from "@/api/billing";
import { AI_TOOLS_META } from "@/lib/ai-tools";
import { extractResumeName, tailoredDocFilename } from "@/lib/filenames";
import TemplatePicker from "@/components/template-picker";
import { Label } from "@/components/ui/label";
import { useResumes } from "@/hooks/use-resumes";
import { AtsScoreCard } from "@/components/ats-score-card";

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
  const { data, isLoading } = useQuery<JobDetail>({
    queryKey: ["jobs", jobId],
    queryFn: () => jobsApi.getJob(jobId!),
    enabled: !!jobId && open,
  });

  const [tab, setTab] = useState<Tab>("ai");
  const [activeToolId, setActiveToolId] = useState<string | null>(null);

  const job = data?.job;
  const artifacts = data?.artifacts ?? [];

  const move = useMutation({
    mutationFn: async (status: Status) => jobsApi.bulkUpdateStatus([jobId!], status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["jobs"] }); qc.invalidateQueries({ queryKey: ["jobs", jobId] }); toast.success("Moved"); },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!flex w-[calc(100vw-2rem)] max-w-5xl h-[85vh] flex-col p-0 gap-0 overflow-hidden">
        {/* Header with glow */}
        <div className="relative border-b bg-gradient-to-br from-primary/10 via-transparent to-transparent px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              {job?.company && <CompanyLogo company={job.company} domain={job.company_domain} url={job.url} size={44} />}
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {job?.company ?? "—"}
                </div>
                <h2 className="line-clamp-2 break-words text-2xl font-bold tracking-tight" title={job?.title}>
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
          {tab === "documents" && <DocumentsTab artifacts={artifacts} jobId={jobId!} job={job} />}
          {tab === "company" && <CompanyTab job={job} />}
          {tab === "ai" && (
            activeToolId
              ? <AiToolRunner jobId={jobId!} toolId={activeToolId} onBack={() => setActiveToolId(null)} job={job} />
              : <AiToolsGrid onPick={setActiveToolId} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Tabs ----------------

function InsightsTab({ job }: { job: any }) {
  const qc = useQueryClient();
  const insights: any = job?.insights ?? null;
  const baseFit: any = job?.base_fit_score ?? null;

  const extract = useMutation({
    mutationFn: (force: boolean) =>
      aiApi.generate({
        prompt_name: "extract_insights",
        vars: { jd: job.description },
        job_id: job.id,
        purpose: "custom",
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["jobs", job.id] }); toast.success("Insights ready"); },
    onError: (e: any) => toast.error(String(e?.message ?? e).slice(0, 200)),
  });

  const scoreBase = useMutation({
    mutationFn: async () => {
      const baseResume = await resumesApi.getBaseResume();
      return aiApi.generate({
        prompt_name: "resume_scorer",
        vars: { jd: job.description, resume_latex: baseResume?.latex_source ?? "" },
        job_id: job.id,
        purpose: "resume_scoring",
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["jobs", job.id] }); toast.success("Base resume scored"); },
    onError: (e: any) => toast.error(String(e?.message ?? e).slice(0, 200)),
  });

  // Analysis is manual — user clicks "Analyze" to run.

  if (!job) return null;

  return (
    <div className="space-y-5">
      {/* AI Powered Summary card */}
      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-primary/10 via-transparent to-transparent p-4">
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
              <Sparkles className="h-3.5 w-3.5" /> AI Powered Summary
            </div>
            <Button
              size="sm" variant="ghost"
              onClick={() => extract.mutate(true)}
              disabled={extract.isPending || !job.description}
            >
              {extract.isPending
                ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Analyzing…</>
                : <><RefreshCw className="mr-1 h-3.5 w-3.5" /> {insights ? "Re-analyze" : "Analyze"}</>}
            </Button>
          </div>
          {insights?.summary ? (
            <p className="text-sm leading-relaxed">{insights.summary}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {job.description ? "Click Analyze to extract keywords, skills, and responsibilities." : "Add a job description first."}
            </p>
          )}
          {insights && (
            <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
              {insights.seniority && insights.seniority !== "unknown" && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium capitalize text-primary">{insights.seniority}</span>
              )}
              {insights.remote && insights.remote !== "unknown" && (
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium capitalize text-emerald-600 dark:text-emerald-400">{insights.remote}</span>
              )}
              {insights.visa_sponsorship && (
                <span
                  className={
                    "rounded-full px-2 py-0.5 font-medium " +
                    (insights.visa_sponsorship === "yes"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : insights.visa_sponsorship === "no"
                      ? "bg-red-500/10 text-red-600 dark:text-red-400"
                      : "bg-muted text-muted-foreground")
                  }
                  title={insights.visa_notes || undefined}
                >
                  {insights.visa_sponsorship === "yes"
                    ? "Visa sponsorship: Yes"
                    : insights.visa_sponsorship === "no"
                    ? "Visa sponsorship: No"
                    : "Visa sponsorship: Not mentioned"}
                </span>
              )}
              {insights.language_required && (
                <span
                  className={
                    "rounded-full px-2 py-0.5 font-medium " +
                    (insights.language_required === "yes"
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      : "bg-muted text-muted-foreground")
                  }
                  title={insights.language_notes || undefined}
                >
                  {insights.language_required === "yes"
                    ? `Language: ${insights.language_notes || "Non-English required"}`
                    : "Language: English only / Not specified"}
                </span>
              )}
            </div>
          )}
          {insights?.visa_notes && (
            <p className="mt-2 text-xs italic text-muted-foreground">
              &ldquo;{insights.visa_notes}&rdquo;
            </p>
          )}
        </div>
      </div>

      {insights && (
        <div className="grid gap-4 md:grid-cols-2">
          <ChipList icon={Tag} title="Top Keywords" items={insights.keywords} tone="primary" />
          <ChipList icon={Target} title="Hard Skills" items={insights.hard_skills} tone="violet" />
          <BulletCard icon={Users} title="Soft Skills" items={insights.soft_skills} />
          <BulletCard icon={GraduationCap} title="Qualifications" items={insights.qualifications} />
          <BulletCard icon={ClipboardList} title="Responsibilities" items={insights.responsibilities} colSpan />
        </div>
      )}

      <FitScoreCard
        title="Base resume fit vs this JD"
        subtitle="How well your default base resume matches this job before tailoring."
        score={baseFit}
        loading={scoreBase.isPending}
        onRun={() => scoreBase.mutate()}
        canRun={!!job.description && job.description.length >= 30}
      />

      <Section icon={ClipboardList} title="Job Description (keywords highlighted)">
        <HighlightedJd text={job.description || "No description saved."} keywords={insights?.keywords ?? []} />
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

function FitChip({ score }: { score: number }) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  const cls = s >= 75
    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    : s >= 50
    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
    : "bg-red-500/10 text-red-600 dark:text-red-400";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      <Target className="h-3 w-3" /> Fit {s}/100
    </span>
  );
}

function FitScoreCard({
  title, subtitle, score, loading, onRun, canRun,
}: {
  title: string; subtitle?: string; score: any; loading: boolean; onRun: () => void; canRun: boolean;
}) {
  const s = Math.max(0, Math.min(100, Number(score?.score ?? 0)));
  const tone = s >= 75 ? "emerald" : s >= 50 ? "amber" : "red";
  const ring =
    tone === "emerald" ? "text-emerald-500" : tone === "amber" ? "text-amber-500" : "text-red-500";
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
        </div>
        <Button size="sm" variant={score ? "ghost" : "default"} onClick={onRun} disabled={loading || !canRun}>
          {loading
            ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Scoring…</>
            : <><Target className="mr-1 h-3.5 w-3.5" /> {score ? "Re-score" : "Score"}</>}
        </Button>
      </div>
      {score && (
        <div className="mt-3 grid gap-4 md:grid-cols-[auto,1fr]">
          <div className="flex items-center gap-3">
            <div className={`text-4xl font-bold ${ring}`}>{s}<span className="text-lg text-muted-foreground">/100</span></div>
          </div>
          <div className="space-y-2 text-xs">
            {score.summary && <p className="text-muted-foreground">{score.summary}</p>}
            {!!score.strengths?.length && (
              <div>
                <div className="mb-1 font-medium text-emerald-600 dark:text-emerald-400">Strengths</div>
                <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                  {score.strengths.slice(0, 5).map((x: string, i: number) => <li key={i}>{x}</li>)}
                </ul>
              </div>
            )}
            {!!score.gaps?.length && (
              <div>
                <div className="mb-1 font-medium text-amber-600 dark:text-amber-400">Gaps</div>
                <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                  {score.gaps.slice(0, 5).map((x: string, i: number) => <li key={i}>{x}</li>)}
                </ul>
              </div>
            )}
            {!!score.missing_keywords?.length && (
              <div>
                <div className="mb-1 font-medium">Missing keywords</div>
                <div className="flex flex-wrap gap-1">
                  {score.missing_keywords.slice(0, 12).map((k: string, i: number) => (
                    <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{k}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {!score && !loading && (
        <p className="mt-2 text-xs text-muted-foreground">
          {canRun ? "Click Score to compare your base resume against this JD." : "Add a job description first."}
        </p>
      )}
    </div>
  );
}

function ChipList({ icon: Icon, title, items, tone }: { icon: any; title: string; items?: string[]; tone: "primary" | "violet" }) {
  if (!items?.length) return null;
  const chip = tone === "primary"
    ? "bg-primary/10 text-primary border-primary/20"
    : "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20";
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {title}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((k, i) => (
          <span key={i} className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${chip}`}>{k}</span>
        ))}
      </div>
    </div>
  );
}

function BulletCard({ icon: Icon, title, items, colSpan }: { icon: any; title: string; items?: string[]; colSpan?: boolean }) {
  if (!items?.length) return null;
  return (
    <div className={`rounded-lg border bg-card p-3 ${colSpan ? "md:col-span-2" : ""}`}>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {title}
      </div>
      <ul className="list-disc space-y-1 pl-4 text-sm">
        {items.map((s, i) => <li key={i}>{s}</li>)}
      </ul>
    </div>
  );
}

function HighlightedJd({ text, keywords }: { text: string; keywords: string[] }) {
  const nodes = useMemo(() => {
    if (!keywords.length) return [text];
    // Sort by length desc so longer phrases match before their substrings
    const sorted = [...keywords].filter(k => k && k.length >= 2).sort((a, b) => b.length - a.length);
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b(${sorted.map(escape).join("|")})\\b`, "gi");
    const parts: (string | { hit: string })[] = [];
    let last = 0;
    for (const m of text.matchAll(pattern)) {
      const idx = m.index ?? 0;
      if (idx > last) parts.push(text.slice(last, idx));
      parts.push({ hit: m[0] });
      last = idx + m[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  }, [text, keywords]);

  return (
    <div className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed">
      {nodes.map((n, i) =>
        typeof n === "string"
          ? <span key={i}>{n}</span>
          : <mark key={i} className="rounded bg-primary/20 px-0.5 font-medium text-foreground">{n.hit}</mark>
      )}
    </div>
  );
}

function NotesTab({ job }: { job: any }) {
  const [notes, setNotes] = useState(job?.notes ?? "");
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () => jobsApi.updateJob(job.id, { notes } as any),
    onSuccess: () => { toast.success("Notes saved"); qc.invalidateQueries({ queryKey: ["jobs", job.id] }); },
    onError: (e: any) => toast.error(String(e?.message ?? e).slice(0, 200)),
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

function DocumentsTab({ artifacts, jobId, job }: { artifacts: any[]; jobId: string; job?: any }) {
  const [zipping, setZipping] = useState(false);
  const qc = useQueryClient();

  const [doTailor, setDoTailor] = useState(true);
  const [doCover, setDoCover] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [ats, setAts] = useState<AtsScoreResult | null>(null);
  const [atsPending, setAtsPending] = useState(false);

  const { data: templates = [] } = useResumes();
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const template = templates.find((t) => t.id === selectedTemplateId)
    ?? templates.find((t) => t.is_default)
    ?? templates[0];

  const gen = useMutation({
    mutationFn: async () => {
      if (!job?.description || job.description.length < 30) throw new Error("Job has no description to generate from.");
      const jd = job.description;
      let localCost = 0;
      let t: any = null, c: any = null;
      const compileJobs: Promise<any>[] = [];
      const baseResume = await resumesApi.getBaseResume();
      const locationLine = job.location
        ? `The job is located in ${job.location}.\n`
        : "";
      const chosen = template ?? baseResume;
      const resumeLatex = chosen?.latex_source ?? "";
      const resumeName = resumeLatex ? (extractResumeName(resumeLatex) || chosen?.name || "resume") : "resume";

      if (doTailor) {
        t = await aiApi.generate({
          prompt_name: "tailor_resume",
          vars: { jd, resume_latex: resumeLatex, page_count: 2, company: job.company, title: job.title, location_line: locationLine },
          job_id: job.id,
          purpose: "resume_tailoring",
        });
        const filename = tailoredDocFilename({ name: resumeName, company: job.company, title: job.title, suffix: "Resume" });
        const savedT = await apiClient.post("/api/v1/jobs/artifacts", {
          job_id: job.id,
          kind: "tailored_resume",
          filename,
          latex_source: t.content,
        }).then((r) => r.data);
        compileJobs.push(resumesApi.compileArtifact(savedT.id).catch(() => null));
        // Fire-and-forget score of the tailored resume vs the JD.
        aiApi.generate({
          prompt_name: "resume_scorer",
          vars: { jd, resume_latex: t.content },
          job_id: job.id,
          purpose: "resume_scoring",
        })
          .then(() => qc.invalidateQueries({ queryKey: ["jobs", jobId] }))
          .catch(() => {});
        localCost += Number(t.total_cost);
      }
      if (doCover) {
        c = await aiApi.generate({
          prompt_name: "generate_cover_letter",
          vars: { jd, resume_latex: resumeLatex, company: job.company, title: job.title, location_line: locationLine },
          job_id: job.id,
          purpose: "cover_letter",
        });
        const filename = tailoredDocFilename({ name: resumeName, company: job.company, title: job.title, suffix: "Cover_Letter" });
        const savedC = await apiClient.post("/api/v1/jobs/artifacts", {
          job_id: job.id,
          kind: "cover_letter",
          filename,
          latex_source: c.content,
        }).then((r) => r.data);
        compileJobs.push(resumesApi.compileArtifact(savedC.id).catch(() => null));
        localCost += Number(c.total_cost);
      }
      await Promise.all(compileJobs);
      return { localCost, tailoredLatex: t?.content ?? null };
    },
    onSuccess: ({ tailoredLatex }: { tailoredLatex: string | null }) => {
      qc.invalidateQueries({ queryKey: ["jobs", jobId] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["billing"] });
      toast.success("Documents generated");
      if (tailoredLatex) {
        setAtsPending(true);
        aiApi.atsScore({ job_id: jobId, latex_source: tailoredLatex })
          .then((r) => setAts(r))
          .catch(() => {})
          .finally(() => setAtsPending(false));
      }
    },
    onError: (e: any) => {
      if (isPaywallError(e)) { setPaywallOpen(true); return; }
      toast.error(e.message);
    },
  });

  async function downloadAll() {
    setZipping(true);
    try {
      const zip = new JSZip();
      const used = new Set<string>();
      const unique = (name: string) => {
        let n = name, i = 1;
        while (used.has(n)) { const dot = name.lastIndexOf("."); n = dot > 0 ? `${name.slice(0, dot)}_${i}${name.slice(dot)}` : `${name}_${i}`; i++; }
        used.add(n); return n;
      };
      for (const a of artifacts) {
        if (a.latex_source) {
          zip.file(unique(a.filename ?? "document.txt"), a.latex_source);
        }
        if (a.pdf_storage_path) {
          try {
            const { url, filename } = await resumesApi.getPdfUrl(a.id);
            const res = await fetch(url);
            if (res.ok) zip.file(unique(filename), await res.arrayBuffer());
          } catch { /* skip failed pdf */ }
        }
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `job_${jobId.slice(0, 8)}_documents.zip`;
      link.click();
      toast.success("Bundled documents");
    } catch (e: any) {
      toast.error(String(e?.message ?? e).slice(0, 200));
    } finally {
      setZipping(false);
    }
  }

  return (
    <div className="space-y-4">
      {job && job.description && job.description.length >= 30 ? (
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-3 text-sm font-semibold">Generate documents</div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={doTailor} onCheckedChange={(v) => setDoTailor(!!v)} /> Tailored resume
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={doCover} onCheckedChange={(v) => setDoCover(!!v)} /> Cover letter
            </label>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Template</Label>
              <div className="w-56">
                <TemplatePicker value={selectedTemplateId} onChange={setSelectedTemplateId} />
              </div>
            </div>
            <Button size="sm" onClick={() => gen.mutate()} disabled={gen.isPending || (!doTailor && !doCover)}>
              {gen.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1 h-3.5 w-3.5" />}
              {gen.isPending ? "Generating…" : "Generate"}
            </Button>
          </div>
          {gen.isPending && (
            <div className="mt-4 border-t pt-2">
              <TailoringLoader
                kind={doTailor && doCover ? "both" : doCover ? "cover_letter" : "resume"}
                estimatedSeconds={doTailor && doCover ? 70 : 45}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
            <div>
              <div className="text-sm font-medium">Job description needed</div>
              <p className="mt-1 text-xs text-muted-foreground">
                This job doesn't have a full description yet. A job description is required to generate tailored resumes and cover letters.
                {job ? " Edit the job to paste the full JD from the listing." : ""}
              </p>
            </div>
          </div>
        </div>
      )}

      <AtsScoreCard result={ats} loading={atsPending} />

      {!artifacts.length && <Empty text="No documents yet. Generate a tailored resume or cover letter for this job." />}

      {!!artifacts.length && (
        <>
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">{artifacts.length} document{artifacts.length === 1 ? "" : "s"}</div>
            <Button size="sm" variant="outline" onClick={downloadAll} disabled={zipping}>
              {zipping ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
              Download all (.zip)
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {artifacts.map((a) => <DocumentCard key={a.id} art={a} jobId={jobId} />)}
          </div>
        </>
      )}
      <PaywallDialog open={paywallOpen} onOpenChange={setPaywallOpen} />
    </div>
  );
}

function DocumentCard({ art, jobId }: { art: any; jobId: string }) {
  const qc = useQueryClient();
  const hasLatex = art.kind === "tailored_resume" || art.kind === "cover_letter";
  const hasPdf = !!art.pdf_storage_path;
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatLog, setChatLog] = useState<Array<{ role: "user" | "assistant"; text: string; updated?: boolean }>>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const compile = useMutation({
    mutationFn: () => resumesApi.compileArtifact(art.id),
    onSuccess: (r: any) => {
      if (r?.ok) { toast.success("PDF compiled"); qc.invalidateQueries({ queryKey: ["jobs", jobId] }); }
      else toast.error(String(r?.error ?? "Compile failed").slice(0, 200));
    },
    onError: (e: any) => toast.error(String(e?.message ?? e).slice(0, 200)),
  });

  const del = useMutation({
    mutationFn: () => jobsApi.deleteArtifact(art.id),
    onSuccess: () => { toast.success("Document deleted"); qc.invalidateQueries({ queryKey: ["jobs", jobId] }); },
    onError: (e: any) => toast.error(String(e?.message ?? e).slice(0, 200)),
  });

  const chat = useMutation({
    mutationFn: async (question: string) => {
      const res = await aiApi.editResume({ latex_source: art.latex_source ?? "", question, job_id: jobId });
      return { answer: res.answer, updatedLatex: res.updated_latex, pageCount: res.page_count };
    },
    onSuccess: async (r) => {
      setChatLog((l) => [...l, { role: "assistant", text: r.answer, updated: !!r.updatedLatex }]);
      if (r.updatedLatex) {
        toast.success(
          r.pageCount > 0
            ? `Resume updated (${r.pageCount} ${r.pageCount === 1 ? "page" : "pages"}) — recompiling…`
            : "Resume updated — recompiling PDF…",
        );
        try {
          await apiClient.patch(`/api/v1/jobs/artifacts/${art.id}`, { latex_source: r.updatedLatex });
          await resumesApi.compileArtifact(art.id);
          qc.invalidateQueries({ queryKey: ["jobs", jobId] });
        } catch (e: any) {
          toast.error(String(e?.message ?? e).slice(0, 200));
        }
      }
    },
    onError: (e: any) => toast.error(String(e?.message ?? e).slice(0, 200)),
  });

  function sendChat() {
    const q = chatInput.trim();
    if (!q || chat.isPending) return;
    setChatLog((l) => [...l, { role: "user", text: q }]);
    setChatInput("");
    chat.mutate(q);
  }

  async function downloadPdf() {
    try {
      const token = localStorage.getItem("access_token");
      const { url, filename } = await resumesApi.getPdfUrl(art.id);
      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error(`Failed to download: ${response.status}`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl; link.download = filename;
      link.click();
      URL.revokeObjectURL(blobUrl);
    } catch (e: any) {
      toast.error(String(e?.message ?? e).slice(0, 200));
    }
  }

  async function openPreview() {
    setPreviewLoading(true);
    try {
      const token = localStorage.getItem("access_token");
      const { url } = await resumesApi.getPdfUrl(art.id, true);
      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error(`Failed to load PDF: ${response.status}`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      setPreviewUrl(blobUrl);
    } catch (e: any) {
      toast.error(String(e?.message ?? e).slice(0, 200));
    } finally {
      setPreviewLoading(false);
    }
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {String(art.kind).replace(/_/g, " ")}
          </span>
          {art.kind === "tailored_resume" && art.fit_score && (
            <FitChip score={Number(art.fit_score.score ?? 0)} />
          )}
        </div>
        {hasPdf
          ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" /> PDF ready
            </span>
          : hasLatex && art.compile_error
            ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" /> Compile failed
              </span>
            : null}
      </div>
      <div className="mb-2 truncate font-mono text-xs">{art.filename}</div>
      <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-[10px] leading-tight">
        {String(art.latex_source ?? "").slice(0, 900)}{(art.latex_source?.length ?? 0) > 900 ? "\n…" : ""}
      </pre>
      {art.compile_error && (
        <div className="mt-2 max-h-24 overflow-auto rounded border border-amber-500/30 bg-amber-500/5 p-2 text-[10px] text-amber-700 dark:text-amber-300">
          {String(art.compile_error).slice(0, 500)}
        </div>
      )}
      <div className="mt-2 flex flex-nowrap gap-1.5 overflow-x-auto">
        {hasPdf && (
          <Button size="sm" variant="secondary" onClick={openPreview} disabled={previewLoading}>
            {previewLoading
              ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Loading…</>
              : <><Eye className="mr-1 h-3.5 w-3.5" /> Preview</>}
          </Button>
        )}
        {hasPdf && (
          <Button size="sm" onClick={downloadPdf}>
            <Download className="mr-1 h-3.5 w-3.5" /> PDF
          </Button>
        )}
        {hasLatex ? (
          <Button size="sm" variant="outline" onClick={() => downloadText(art.filename, art.latex_source ?? "")}>
            <Download className="mr-1 h-3.5 w-3.5" /> .tex
          </Button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <Download className="mr-1 h-3.5 w-3.5" /> Download
                <ChevronDown className="ml-1 h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={() => downloadAs("txt", art.filename?.replace(/\.[^.]+$/, "") ?? "document", art.latex_source ?? "")}>
                <FileText className="mr-2 h-4 w-4" /> Plain text (.txt)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadAs("pdf", art.filename?.replace(/\.[^.]+$/, "") ?? "document", art.latex_source ?? "")}>
                <FileText className="mr-2 h-4 w-4" /> PDF (.pdf)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadAs("docx", art.filename?.replace(/\.[^.]+$/, "") ?? "document", art.latex_source ?? "").catch((e) => toast.error(String(e?.message ?? e).slice(0, 200)))}>
                <FileText className="mr-2 h-4 w-4" /> Word (.docx)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {hasLatex && (
          <Button size="sm" variant="ghost" onClick={() => compile.mutate()} disabled={compile.isPending}>
            {compile.isPending
              ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Compiling…</>
              : <><RefreshCw className="mr-1 h-3.5 w-3.5" /> {hasPdf ? "Recompile" : "Compile PDF"}</>}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={async () => { try { await navigator.clipboard.writeText(art.latex_source ?? ""); toast.success("Copied to clipboard"); } catch { toast.error("Failed to copy"); } }}>
          <Copy className="mr-1 h-3.5 w-3.5" /> Copy
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this document?</AlertDialogTitle>
              <AlertDialogDescription>
                {art.filename} will be removed along with its compiled PDF. This can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => del.mutate()} disabled={del.isPending}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {hasLatex && (
          <Button size="sm" variant="ghost" onClick={() => setChatOpen((v) => !v)}>
            <MessageSquare className="mr-1 h-3.5 w-3.5" /> {chatOpen ? "Hide AI" : "Ask AI"}
          </Button>
        )}
      </div>
      {hasLatex && chatOpen && (
        <div className="mt-3 rounded-md border bg-muted/30 p-2">
          <div className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            Ask a question about this resume, or tell the AI to edit it (e.g. "remove PyTorch bullets").
          </div>
          {chatLog.length > 0 && (
            <div className="mb-2 max-h-64 space-y-2 overflow-auto">
              {chatLog.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === "user"
                      ? "rounded-md bg-primary/10 p-2 text-xs"
                      : "rounded-md bg-card p-2 text-xs border"
                  }
                >
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {m.role === "user" ? "You" : m.updated ? "Assistant · resume updated" : "Assistant"}
                  </div>
                  <div className="prose prose-xs max-w-none whitespace-pre-wrap dark:prose-invert">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                  </div>
                </div>
              ))}
              {chat.isPending && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
                </div>
              )}
            </div>
          )}
          <div className="flex items-end gap-2">
            <Textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              rows={2}
              placeholder="Ask a question or request a change…"
              className="min-h-[52px] text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendChat(); }
              }}
            />
            <Button size="sm" onClick={sendChat} disabled={chat.isPending || !chatInput.trim()}>
              {chat.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      )}
      <Dialog open={!!previewUrl} onOpenChange={(o) => { if (!o) setPreviewUrl(null); }}>
        <DialogContent className="!flex w-[calc(100vw-2rem)] max-w-5xl h-[90vh] flex-col p-0 gap-0 overflow-hidden">
          <div className="flex items-center justify-between border-b px-4 py-2 shrink-0 pr-12">
            <div className="truncate text-sm font-medium">{art.filename?.replace(/\.tex$/i, ".pdf")}</div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={downloadPdf}>
                <Download className="mr-1 h-3.5 w-3.5" /> Download
              </Button>
            </div>
          </div>
          {previewUrl && (
            <iframe
              src={`${previewUrl}#toolbar=1&view=FitH`}
              title="PDF preview"
              className="flex-1 w-full bg-muted"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CompanyTab({ job }: { job: any }) {
  const [info, setInfo] = useState<{ description?: string | null; url?: string | null; source?: string | null; loading: boolean }>({ loading: false });

  useEffect(() => {
    if (!job?.id) return;
    let cancelled = false;
    setInfo({ loading: true });
    jobsApi
      .getCompanyInfo(job.id)
      .then((r) => {
        if (cancelled) return;
        setInfo({ loading: false, description: r.description, url: r.url, source: r.source });
      })
      .catch(() => !cancelled && setInfo({ loading: false }));
    return () => { cancelled = true; };
  }, [job?.id]);

  if (!job) return null;
  const domain = resolveCompanyDomain({ domain: job.company_domain, url: job.url, company: job.company });
  const website = `https://${domain}`;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="space-y-4 md:col-span-2">
        <div className="flex items-start gap-3 rounded-xl border bg-card p-4">
          <CompanyLogo company={job.company} domain={job.company_domain} url={job.url} size={48} />
          <div className="min-w-0 flex-1">
            <div className="text-xl font-bold">{job.company}</div>
            {info.loading && <div className="mt-2 text-sm text-muted-foreground">Loading background…</div>}
            {info.description && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{info.description}</p>}
            {!info.loading && !info.description && (
              <p className="mt-2 text-sm text-muted-foreground">No public background found. Try visiting the company website.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={website} target="_blank" rel="noreferrer">
                <Button size="sm">Visit website</Button>
              </a>
              {info.source === "wikipedia" && info.url && (
                <a href={info.url} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline">Read on Wikipedia</Button>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-2 rounded-xl border bg-card p-4 text-sm">
        <div>
          <div className="text-xs uppercase text-muted-foreground">Website</div>
          <a href={website} target="_blank" rel="noreferrer" className="break-all text-primary underline">{domain}</a>
        </div>
        {job.url && (
          <div>
            <div className="text-xs uppercase text-muted-foreground">Job posting</div>
            <a href={job.url} target="_blank" rel="noreferrer" className="break-all text-xs text-primary underline">{job.url}</a>
          </div>
        )}
        <div>
          <div className="text-xs uppercase text-muted-foreground">Role</div>
          <div>{job.title}</div>
        </div>
        {job.date_applied && (
          <div>
            <div className="text-xs uppercase text-muted-foreground">Applied</div>
            <div>{job.date_applied}</div>
          </div>
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

function AiToolRunner({ jobId, toolId, onBack, job }: { jobId: string; toolId: string; onBack: () => void; job?: any }) {
  const tool = AI_TOOLS_META.find((t) => t.id === toolId);
  const qc = useQueryClient();
  const [ctx, setCtx] = useState("");
  const [result, setResult] = useState<{ content: string; label: string } | null>(null);
  const [view, setView] = useState<"preview" | "edit">("preview");
  const [paywallOpen, setPaywallOpen] = useState(false);

  const quotaQ = useQuery({
    queryKey: ["billing"],
    queryFn: () => billingApi.getStatus(),
  });

  const run = useMutation({
    mutationFn: async () => {
      const gate = await aiApi.checkEntitlement(jobId);
      if (!gate?.allowed) {
        const err: any = new Error("QUOTA_REACHED");
        err.__quota = true;
        throw err;
      }
      qc.invalidateQueries({ queryKey: ["billing"] });
      const baseResume = await resumesApi.getBaseResume();
      const resumeText = baseResume?.latex_source ?? "";
      const fullContext = resumeText ? `=== CANDIDATE'S RESUME (for factual grounding) ===\n${resumeText}\n\n=== ADDITIONAL CONTEXT ===\n${ctx}` : ctx;
      return aiApi.generate({
        prompt_name: toolId,
        vars: { jd: job?.description ?? "", context: fullContext },
        job_id: jobId,
        purpose: "custom",
      });
    },
    onSuccess: (r: any) => { setResult({ content: r.content, label: tool?.label ?? toolId }); qc.invalidateQueries({ queryKey: ["costs"] }); },
    onError: (e: any) => {
      if (e?.__quota || String(e?.message ?? "").includes("QUOTA_REACHED")) {
        setPaywallOpen(true);
        return;
      }
      if (isPaywallError(e)) { setPaywallOpen(true); return; }
      toast.error(String(e?.message ?? e).slice(0, 200));
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const slug = (s: string) =>
        s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
      const parts = [
        slug(result!.label),
        job?.company ? slug(job.company) : "",
        job?.title ? slug(job.title) : "",
      ].filter(Boolean);
      const filename = `${parts.join("__")}.txt`;
      return apiClient.post("/api/v1/jobs/artifacts", {
        job_id: jobId,
        kind: "ai_tool",
        filename,
        latex_source: result!.content,
      }).then((r) => r.data);
    },
    onSuccess: () => { toast.success("Saved to Documents"); qc.invalidateQueries({ queryKey: ["jobs", jobId] }); },
    onError: (e: any) => toast.error(String(e?.message ?? e).slice(0, 200)),
  });

  if (!tool) return null;
  const a = ACCENT[tool.accent] ?? ACCENT.indigo;
  const fileLabel = (label: string) => {
    const parts = [label, job?.company, job?.title].filter(Boolean).map((s: string) => String(s));
    return parts.join(" — ");
  };
  const q: any = quotaQ.data;
  const showQuota = !!q && !q.has_pro;
  const remaining = showQuota ? Math.max(Number(q.trial_limit ?? 2) - Number(q.trial_used ?? 0), 0) : null;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> back to tools
      </button>

      {showQuota && (
        <div className="flex items-center justify-between rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs">
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">{remaining}</span> of {q.trial_limit} free prompts remaining
          </span>
          <Link to="/billing" className="font-medium text-primary hover:underline">Upgrade</Link>
        </div>
      )}

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
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
            <div className="flex items-center gap-3">
              <div className="text-sm font-semibold">{result.label}</div>
              <div className="inline-flex overflow-hidden rounded-md border text-[11px]">
                <button onClick={() => setView("preview")} className={`px-2 py-1 ${view === "preview" ? "bg-muted font-medium" : "text-muted-foreground"}`}>Preview</button>
                <button onClick={() => setView("edit")} className={`px-2 py-1 border-l ${view === "edit" ? "bg-muted font-medium" : "text-muted-foreground"}`}>Edit</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant="ghost" onClick={async () => { try { await navigator.clipboard.writeText(result.content); toast.success("Copied to clipboard"); } catch { toast.error("Failed to copy"); } }}>
                <Copy className="mr-1 h-3.5 w-3.5" /> Copy
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    <Save className="mr-1 h-3.5 w-3.5" /> Save
                    <ChevronDown className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Save to app</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => save.mutate()} disabled={save.isPending}>
                    <FolderOpen className="mr-2 h-4 w-4" /> Save to Documents
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Download as</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => downloadAs("txt", fileLabel(result.label), result.content)}>
                    <FileText className="mr-2 h-4 w-4" /> Plain text (.txt)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => downloadAs("pdf", fileLabel(result.label), result.content).catch((e) => toast.error(String(e?.message ?? e).slice(0, 200)))}>
                    <FileText className="mr-2 h-4 w-4" /> PDF (.pdf)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => downloadAs("docx", fileLabel(result.label), result.content).catch((e) => toast.error(String(e?.message ?? e).slice(0, 200)))}>
                    <FileText className="mr-2 h-4 w-4" /> Word (.docx)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {view === "preview" ? (
            <div className="prose prose-sm dark:prose-invert max-w-none min-h-[420px] max-h-[560px] overflow-auto px-5 py-4 prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] prose-pre:bg-muted">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.content}</ReactMarkdown>
            </div>
          ) : (
            <Textarea
              value={result.content}
              onChange={(e) => setResult({ ...result, content: e.target.value })}
              rows={18}
              className="min-h-[420px] max-h-[560px] rounded-none border-0 font-mono text-sm leading-relaxed focus-visible:ring-0"
            />
          )}
        </div>
      )}
      <PaywallDialog open={paywallOpen} onOpenChange={setPaywallOpen} />
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