import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { jobsApi } from "@/api/jobs";
import { resumesApi } from "@/api/resumes";
import { aiApi, type AtsScoreResult } from "@/api/ai";
import apiClient from "@/api/client";
import { PaywallDialog, isPaywallError, extractPaywallInfo, type PaywallInfo } from "@/components/paywall-dialog";
import { AtsScoreCard } from "@/components/ats-score-card";

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Wand2, Download, FileText, Sparkles } from "lucide-react";
import { LatexPreview } from "@/components/latex-preview";
import { TailoringLoader } from "@/components/tailoring-loader";
import { PageTitle } from "@/components/page-title";
import TemplatePicker from "@/components/template-picker";
import { useResumes, useBaseResume } from "@/hooks/use-resumes";
import { extractResumeName, tailoredDocFilename } from "@/lib/filenames";

// ---- wrapper functions that match original server fn shapes ----

async function _scoreResume(args: { jd: string; job_id: string; resume_latex: string }) {
  const result = await aiApi.generate({
    prompt_name: "resume_scorer",
    vars: { jd: args.jd, resume_latex: args.resume_latex },
    job_id: args.job_id,
    purpose: "resume_scoring",
  });
  return { report: JSON.parse(result.content), cost: result.total_cost };
}

async function _tailorResume(args: { jd: string; company: string; title: string; job_id: string; resumeName: string; resumeLatex: string; locationLine: string }) {
  const result = await aiApi.generate({
    prompt_name: "tailor_resume",
    vars: { jd: args.jd, resume_latex: args.resumeLatex, company: args.company, title: args.title, location_line: args.locationLine },
    job_id: args.job_id,
    purpose: "resume_tailoring",
  });
  return {
    latex: result.content,
    filename: tailoredDocFilename({ name: args.resumeName, company: args.company, title: args.title, suffix: "Resume" }),
    cost: result.total_cost,
  };
}

async function _generateCoverLetter(args: { jd: string; company: string; title: string; job_id: string; resumeName: string; resumeLatex: string; locationLine: string }) {
  const result = await aiApi.generate({
    prompt_name: "generate_cover_letter",
    vars: { jd: args.jd, resume_latex: args.resumeLatex, company: args.company, title: args.title, location_line: args.locationLine },
    job_id: args.job_id,
    purpose: "cover_letter",
  });
  return {
    latex: result.content,
    filename: tailoredDocFilename({ name: args.resumeName, company: args.company, title: args.title, suffix: "Cover_Letter" }),
    cost: result.total_cost,
  };
}

async function _saveArtifact(args: { job_id: string; kind: string; filename: string; latex_source: string }) {
  const { data } = await apiClient.post("/api/v1/jobs/artifacts", args);
  return data;
}

async function _compileArtifactPdf(args: { artifact_id: string }) {
  return resumesApi.compileArtifact(args.artifact_id);
}

export default function GeneratePage() {
  const qc = useQueryClient();

  const { data: allJobs = [] } = useQuery({ queryKey: ["jobs", "all"], queryFn: () => jobsApi.listJobs() });

  const { data: baseResume } = useBaseResume();
  const { data: templates = [] } = useResumes();
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const template = templates.find((t) => t.id === selectedTemplateId)
    ?? templates.find((t) => t.is_default)
    ?? templates[0]
    ?? baseResume;
  const resumeName = template?.latex_source
    ? extractResumeName(template.latex_source) || template.name || "resume"
    : "resume";

  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const selectedJob = allJobs.find((j: any) => j.id === selectedJobId);

  const [doTailor, setDoTailor] = useState(true);
  const [doCover, setDoCover] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallInfo, setPaywallInfo] = useState<PaywallInfo | null>(null);

  const [report, setReport] = useState<any>(null);
  const [tailored, setTailored] = useState<{ latex: string; filename: string } | null>(null);
  const [cover, setCover] = useState<{ latex: string; filename: string } | null>(null);
  const [totalCost, setTotalCost] = useState(0);
  const [ats, setAts] = useState<AtsScoreResult | null>(null);
  const [atsPending, setAtsPending] = useState(false);

  const scoreMut = useMutation({
    mutationFn: async () => {
      if (!selectedJob?.description || selectedJob.description.length < 30) throw new Error("Selected job has no description to score against.");
      return _scoreResume({ jd: selectedJob.description, job_id: selectedJob.id, resume_latex: template?.latex_source || "" });
    },
    onSuccess: (r: any) => { setReport(r.report); setTotalCost((c) => c + Number(r.cost)); qc.invalidateQueries({ queryKey: ["billing"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const genMut = useMutation({
    mutationFn: async () => {
      if (!selectedJob) throw new Error("Select a job first.");
      const jd = selectedJob.description ?? "";
      if (jd.length < 30) throw new Error("Selected job has no description.");

      let localCost = 0;
      let t: any = null, c: any = null;
      const compileJobs: Promise<any>[] = [];
      const locationLine = selectedJob.location
        ? `The job is located in ${selectedJob.location}.\n`
        : "";
      if (doTailor) {
        t = await _tailorResume({ jd, company: selectedJob.company, title: selectedJob.title, job_id: selectedJob.id, resumeName, resumeLatex: template?.latex_source || "", locationLine });
        const savedT = await _saveArtifact({ job_id: selectedJob.id, kind: "tailored_resume", filename: t.filename, latex_source: t.latex });
        compileJobs.push(_compileArtifactPdf({ artifact_id: savedT.id }).catch(() => null));
        localCost += Number(t.cost);
      }
      if (doCover) {
        c = await _generateCoverLetter({ jd, company: selectedJob.company, title: selectedJob.title, job_id: selectedJob.id, resumeName, resumeLatex: template?.latex_source || "", locationLine });
        const savedC = await _saveArtifact({ job_id: selectedJob.id, kind: "cover_letter", filename: c.filename, latex_source: c.latex });
        compileJobs.push(_compileArtifactPdf({ artifact_id: savedC.id }).catch(() => null));
        localCost += Number(c.cost);
      }
      await Promise.all(compileJobs);
      return { t, c, localCost };
    },
    onSuccess: ({ t, c, localCost }) => {
      if (t) setTailored(t);
      if (c) setCover(c);
      setTotalCost((x) => x + localCost);
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["billing"] });
      toast.success("Generated and saved to job");
      if (t && selectedJob) {
        setAtsPending(true);
        aiApi.atsScore({ job_id: selectedJob.id, latex_source: t.latex })
          .then((r) => setAts(r))
          .catch(() => {})
          .finally(() => setAtsPending(false));
      }
    },
    onError: (e: any) => {
      if (isPaywallError(e)) { setPaywallInfo(extractPaywallInfo(e)); setPaywallOpen(true); return; }
      toast.error(e.message);
    },
  });

  function download(name: string, content: string) {
    const blob = new Blob([content], { type: "application/x-tex" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
  }

  return (
    <div className="p-6">
      <PageTitle title="Generate" />
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Generate</h1>
        <p className="text-sm text-muted-foreground">Select a saved job, score your fit, and generate documents.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Job</CardTitle>
            <CardDescription>Pick a job from your board.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={selectedJobId} onValueChange={(v) => { setSelectedJobId(v); setReport(null); setTailored(null); setCover(null); }}>
              <SelectTrigger><SelectValue placeholder="Choose a job…" /></SelectTrigger>
              <SelectContent>
                {allJobs.map((j: any) => (
                  <SelectItem key={j.id} value={j.id}>{j.company} — {j.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Resume template</Label>
              <TemplatePicker
                value={selectedTemplateId}
                onChange={(v) => { setSelectedTemplateId(v); setReport(null); setTailored(null); setCover(null); }}
              />
            </div>

            {selectedJob && (
              <div className="space-y-2">
                <div className="text-sm font-medium">{selectedJob.title} <span className="text-muted-foreground">@ {selectedJob.company}</span></div>
                {selectedJob.description && (
                  <div className="max-h-64 overflow-auto rounded border bg-muted/30 p-3 text-xs whitespace-pre-wrap leading-relaxed">
                    {selectedJob.description}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Button onClick={() => scoreMut.mutate()} disabled={scoreMut.isPending || !selectedJob.description || selectedJob.description.length < 30} variant="outline" size="sm">
                    <Sparkles className="mr-1.5 h-4 w-4" />{scoreMut.isPending ? "Scoring…" : "Score my resume"}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-4 pt-1">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={doTailor} onCheckedChange={(v) => setDoTailor(!!v)} /> Generate tailored resume
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={doCover} onCheckedChange={(v) => setDoCover(!!v)} /> Generate cover letter
              </label>
            </div>

            <Button onClick={() => genMut.mutate()} disabled={genMut.isPending || !selectedJob || (!doTailor && !doCover)}>
              <Wand2 className="mr-1.5 h-4 w-4" />{genMut.isPending ? "Generating…" : "Generate & save"}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {genMut.isPending && (
            <Card>
              <CardContent className="pt-6">
                <TailoringLoader
                  kind={doTailor && doCover ? "both" : doCover ? "cover_letter" : "resume"}
                  estimatedSeconds={doTailor && doCover ? 70 : 45}
                />
              </CardContent>
            </Card>
          )}

          {report && (
            <Card>
              <CardHeader>
                <CardTitle>Resume score: {report.score}/100</CardTitle>
                <CardDescription>{report.summary}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Progress value={report.score} />
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded bg-muted/50 p-2">Keywords<br /><span className="text-lg font-semibold">{report.keyword_score ?? "—"}</span></div>
                  <div className="rounded bg-muted/50 p-2">Responsibilities<br /><span className="text-lg font-semibold">{report.responsibility_score ?? "—"}</span></div>
                  <div className="rounded bg-muted/50 p-2">ATS<br /><span className="text-lg font-semibold">{report.ats_score ?? "—"}</span></div>
                </div>
                <ReportList title="Strengths" items={report.strengths} />
                <ReportList title="Gaps" items={report.gaps} />
                <ReportList title="Missing keywords" items={report.missing_keywords} />
              </CardContent>
            </Card>
          )}

          <AtsScoreCard result={ats} loading={atsPending} />

          {tailored && !genMut.isPending && (
            <ArtifactCard title="Tailored resume" filename={tailored.filename} latex={tailored.latex} onDownload={() => download(tailored.filename, tailored.latex)} />
          )}
          {cover && !genMut.isPending && (
            <ArtifactCard title="Cover letter" filename={cover.filename} latex={cover.latex} onDownload={() => download(cover.filename, cover.latex)} />
          )}
        </div>
      </div>
      <PaywallDialog open={paywallOpen} onOpenChange={setPaywallOpen} info={paywallInfo} />
    </div>
  );
}

function ReportList({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">{title}</div>
      <ul className="list-disc space-y-0.5 pl-5 text-sm">{items.map((s, i) => <li key={i}>{s}</li>)}</ul>
    </div>
  );
}

function ArtifactCard({ title, filename, latex, onDownload }: any) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" />{title}</CardTitle>
          <CardDescription className="font-mono text-xs">{filename}</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={onDownload}><Download className="mr-1 h-4 w-4" />.tex</Button>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="h-96 overflow-hidden rounded border">
          <LatexPreview
            source={latex}
            cacheKey={`generate:${filename}`}
            downloadFilename={filename.replace(/\.tex$/i, ".pdf")}
          />
        </div>
        <details className="rounded border bg-muted/30 text-xs">
          <summary className="cursor-pointer select-none px-2 py-1.5 text-muted-foreground">View LaTeX source</summary>
          <pre className="max-h-64 overflow-auto p-2 text-[10px] leading-tight">{latex.slice(0, 4000)}{latex.length > 4000 ? "\n..." : ""}</pre>
        </details>
      </CardContent>
    </Card>
  );
}
