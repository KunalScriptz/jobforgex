import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { scoreResume, tailorResume, generateCoverLetter, saveArtifact } from "@/lib/ai-generate.functions";
import { listBoards } from "@/lib/workspace.functions";
import { listModels } from "@/lib/ai-config.functions";
import { createJob } from "@/lib/jobs.functions";

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Wand2, Download, FileText, Sparkles } from "lucide-react";
import { LatexPreview } from "@/components/latex-preview";

export const Route = createFileRoute("/_authenticated/generate")({ component: GeneratePage });

function GeneratePage() {
  const qc = useQueryClient();
  const scoreFn = useServerFn(scoreResume);
  const tailorFn = useServerFn(tailorResume);
  const coverFn = useServerFn(generateCoverLetter);
  const createJobFn = useServerFn(createJob);
  const saveArtifactFn = useServerFn(saveArtifact);
  const getBoards = useServerFn(listBoards);
  const getModels = useServerFn(listModels);

  const { data: boards = [] } = useQuery({ queryKey: ["boards"], queryFn: () => getBoards() });
  const { data: models = [] } = useQuery({ queryKey: ["models"], queryFn: () => getModels() });

  const [jd, setJd] = useState("");
  const [url, setUrl] = useState("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [boardId, setBoardId] = useState<string>("");
  const [modelId, setModelId] = useState<string>("");
  const [doTailor, setDoTailor] = useState(true);
  const [doCover, setDoCover] = useState(false);

  const [report, setReport] = useState<any>(null);
  const [tailored, setTailored] = useState<{ latex: string; filename: string } | null>(null);
  const [cover, setCover] = useState<{ latex: string; filename: string } | null>(null);
  const [totalCost, setTotalCost] = useState(0);

  const scoreMut = useMutation({
    mutationFn: async () => scoreFn({ data: { jd, model_id: modelId || undefined } } as any),
    onSuccess: (r: any) => { setReport(r.report); setTotalCost((c) => c + Number(r.cost)); qc.invalidateQueries({ queryKey: ["costs"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const genMut = useMutation({
    mutationFn: async () => {
      if (!company || !title || !boardId) throw new Error("Company, title, and board are required");
      const activeBoard = boardId || boards[0]?.id;
      const job = await createJobFn({ data: {
        board_id: activeBoard, company, title, description: jd, url: url || null,
        status: "wishlist",
        resume_score: report?.score ?? null,
      } } as any);

      let localCost = 0;
      let t: any = null, c: any = null;
      if (doTailor) {
        t = await tailorFn({ data: { jd, company, title, model_id: modelId || undefined, job_id: job.id } } as any);
        await saveArtifactFn({ data: { job_id: job.id, kind: "tailored_resume", filename: t.filename, latex_source: t.latex } } as any);
        localCost += Number(t.cost);
      }
      if (doCover) {
        c = await coverFn({ data: { jd, company, title, model_id: modelId || undefined, job_id: job.id } } as any);
        await saveArtifactFn({ data: { job_id: job.id, kind: "cover_letter", filename: c.filename, latex_source: c.latex } } as any);
        localCost += Number(c.cost);
      }
      return { t, c, localCost, jobId: job.id };
    },
    onSuccess: ({ t, c, localCost }) => {
      if (t) setTailored(t);
      if (c) setCover(c);
      setTotalCost((x) => x + localCost);
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["costs"] });
      toast.success("Generated & saved to your board");
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
        <p className="text-sm text-muted-foreground">Paste a JD → score → tailor → save.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Job description</CardTitle>
            <CardDescription>Paste the JD. Optionally add company, title, and URL.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Company</Label><Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Inc." /></div>
              <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Senior Data Scientist" /></div>
            </div>
            <div><Label>Job URL (optional)</Label><Input value={url} onChange={(e) => setUrl(e.target.value)} /></div>
            <div><Label>Board</Label>
              <Select value={boardId} onValueChange={setBoardId}>
                <SelectTrigger><SelectValue placeholder="Choose board" /></SelectTrigger>
                <SelectContent>{boards.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Model</Label>
              <Select value={modelId} onValueChange={setModelId}>
                <SelectTrigger><SelectValue placeholder="Default model" /></SelectTrigger>
                <SelectContent>{models.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.display_name}{m.is_default ? " (default)" : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Job description</Label>
              <Textarea rows={12} value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Paste the full JD here..." />
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => scoreMut.mutate()} disabled={scoreMut.isPending || jd.length < 30} variant="outline">
                <Sparkles className="mr-1.5 h-4 w-4" />{scoreMut.isPending ? "Scoring..." : "Score my resume"}
              </Button>
              <div className="ml-auto text-xs text-muted-foreground">Total session cost: ${totalCost.toFixed(4)}</div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
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

          <Card>
            <CardHeader>
              <CardTitle>Generate</CardTitle>
              <CardDescription>Creates the job, saves artifacts, moves it to Wishlist.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={doTailor} onCheckedChange={(v) => setDoTailor(!!v)} /> Generate tailored resume
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={doCover} onCheckedChange={(v) => setDoCover(!!v)} /> Generate cover letter
              </label>
              <Button onClick={() => genMut.mutate()} disabled={genMut.isPending || jd.length < 30 || !company || !title || !boardId}>
                <Wand2 className="mr-1.5 h-4 w-4" />{genMut.isPending ? "Generating..." : "Generate & save"}
              </Button>
            </CardContent>
          </Card>

          {tailored && (
            <ArtifactCard title="Tailored resume" filename={tailored.filename} latex={tailored.latex} onDownload={() => download(tailored.filename, tailored.latex)} />
          )}
          {cover && (
            <ArtifactCard title="Cover letter" filename={cover.filename} latex={cover.latex} onDownload={() => download(cover.filename, cover.latex)} />
          )}
        </div>
      </div>
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
          <LatexPreview source={latex} />
        </div>
        <details className="rounded border bg-muted/30 text-xs">
          <summary className="cursor-pointer select-none px-2 py-1.5 text-muted-foreground">View LaTeX source</summary>
          <pre className="max-h-64 overflow-auto p-2 text-[10px] leading-tight">{latex.slice(0, 4000)}{latex.length > 4000 ? "\n..." : ""}</pre>
        </details>
      </CardContent>
    </Card>
  );
}