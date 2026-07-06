import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { scoreResume, tailorResume, generateCoverLetter, saveArtifact } from "@/lib/ai-generate.functions";
import { listJobs } from "@/lib/jobs.functions";
import { listModels } from "@/lib/ai-config.functions";
import { compileArtifactPdf } from "@/lib/pdf.functions";

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Wand2, Download, FileText, Sparkles } from "lucide-react";
import { LatexPreview } from "@/components/latex-preview";
import { TailoringLoader } from "@/components/tailoring-loader";

export const Route = createFileRoute("/_authenticated/generate")({ component: GeneratePage });

function GeneratePage() {
  const qc = useQueryClient();
  const scoreFn = useServerFn(scoreResume);
  const tailorFn = useServerFn(tailorResume);
  const coverFn = useServerFn(generateCoverLetter);
  const saveArtifactFn = useServerFn(saveArtifact);
  const compilePdfFn = useServerFn(compileArtifactPdf);
  const getJobs = useServerFn(listJobs);
  const getModels = useServerFn(listModels);

  const { data: allJobs = [] } = useQuery({ queryKey: ["jobs", "all"], queryFn: () => getJobs({ data: {} } as any) });
  const { data: models = [] } = useQuery({ queryKey: ["models"], queryFn: () => getModels() });

  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const selectedJob = allJobs.find((j: any) => j.id === selectedJobId);

  const [modelId, setModelId] = useState<string>("");
  const [doTailor, setDoTailor] = useState(true);
  const [doCover, setDoCover] = useState(false);

  const [report, setReport] = useState<any>(null);
  const [tailored, setTailored] = useState<{ latex: string; filename: string } | null>(null);
  const [cover, setCover] = useState<{ latex: string; filename: string } | null>(null);
  const [totalCost, setTotalCost] = useState(0);

  const scoreMut = useMutation({
    mutationFn: async () => {
      if (!selectedJob?.description || selectedJob.description.length < 30) throw new Error("Selected job has no description to score against.");
      return scoreFn({ data: { jd: selectedJob.description, model_id: modelId || undefined, job_id: selectedJob.id } } as any);
    },
    onSuccess: (r: any) => { setReport(r.report); setTotalCost((c) => c + Number(r.cost)); qc.invalidateQueries({ queryKey: ["costs"] }); },
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
      if (doTailor) {
        t = await tailorFn({ data: { jd, company: selectedJob.company, title: selectedJob.title, model_id: modelId || undefined, job_id: selectedJob.id } } as any);
        const savedT = await saveArtifactFn({ data: { job_id: selectedJob.id, kind: "tailored_resume", filename: t.filename, latex_source: t.latex } } as any);
        compileJobs.push(compilePdfFn({ data: { artifact_id: savedT.id } } as any).catch(() => null));
        localCost += Number(t.cost);
      }
      if (doCover) {
        c = await coverFn({ data: { jd, company: selectedJob.company, title: selectedJob.title, model_id: modelId || undefined, job_id: selectedJob.id } } as any);
        const savedC = await saveArtifactFn({ data: { job_id: selectedJob.id, kind: "cover_letter", filename: c.filename, latex_source: c.latex } } as any);
        compileJobs.push(compilePdfFn({ data: { artifact_id: savedC.id } } as any).catch(() => null));
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
      qc.invalidateQueries({ queryKey: ["costs"] });
      toast.success("Generated and saved to job");
    },
    onError: (e: any) => toast.error(e.message),
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

            <div><Label>Model</Label>
              <Select value={modelId} onValueChange={setModelId}>
                <SelectTrigger><SelectValue placeholder="Default model" /></SelectTrigger>
                <SelectContent>{models.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.display_name}{m.is_default ? " (default)" : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>

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

            <div className="text-xs text-muted-foreground">Total session cost: ${totalCost.toFixed(4)}</div>
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

          {tailored && !genMut.isPending && (
            <ArtifactCard title="Tailored resume" filename={tailored.filename} latex={tailored.latex} onDownload={() => download(tailored.filename, tailored.latex)} />
          )}
          {cover && !genMut.isPending && (
            <ArtifactCard title="Cover letter" filename={cover.filename} latex={cover.latex} onDownload={() => download(cover.filename, cover.latex)} />
          )}
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-sm font-medium leading-none">{children}</div>;
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
