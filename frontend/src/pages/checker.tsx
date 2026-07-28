import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { resumesApi } from "@/api/resumes";
import { aiApi } from "@/api/ai";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { ClipboardCheck, AlertTriangle } from "lucide-react";

async function _scoreResume(args: { jd: string }) {
  const result = await aiApi.generate({
    prompt_name: "score_resume",
    vars: { job_description: args.jd },
    purpose: "score",
  });
  return { report: JSON.parse(result.content), cost: result.total_cost };
}

export default function CheckerPage() {
  const { data: resume } = useQuery({ queryKey: ["resume","base"], queryFn: () => resumesApi.getBaseResume() });
  const [jd, setJd] = useState("");
  const [scoreReport, setScoreReport] = useState<any>(null);
  const [errText, setErrText] = useState<string>("");

  const MIN_JD = 80;
  const MAX_JD = 20_000;
  const jdTrimmed = jd.trim();
  const jdLen = jdTrimmed.length;
  const jdEmpty = jdLen === 0;
  const jdTooShort = !jdEmpty && jdLen < MIN_JD;
  const jdTooLong = jdLen > MAX_JD;
  const jdWordCount = jdEmpty ? 0 : jdTrimmed.split(/\s+/).length;
  const jdBlocked = jdEmpty || jdTooShort || jdTooLong;

  const runAll = useMutation({
    mutationFn: async () => {
      if (jdBlocked) {
        throw new Error(
          jdEmpty
            ? "Paste a job description to score your resume against it."
            : jdTooShort
            ? `Job description is too short (${jdLen} chars). Paste at least ${MIN_JD} characters, or clear the field to run only the ATS audit.`
            : `Job description is too long (${jdLen} chars). Trim it to under ${MAX_JD.toLocaleString()} characters.`,
        );
      }
      return { score: await _scoreResume({ jd: jdTrimmed }) };
    },
    onSuccess: (r: any) => {
      setErrText("");
      setScoreReport(r.score?.report ?? null);
      toast.success("JD match complete");
    },
    onError: (e: any) => {
      const raw = e?.message ?? e?.toString?.() ?? "Unknown error";
      let pretty = raw;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          pretty = "Input validation failed:\n" +
            parsed.map((p: any) => `• ${p.path?.join(".") || "(root)"}: ${p.message}`).join("\n");
        }
      } catch {}
      const cause = e?.cause ? `\n\ncause: ${JSON.stringify(e.cause).slice(0, 500)}` : "";
      setErrText(`${pretty}${cause}`);
      toast.error(pretty.split("\n")[0].slice(0, 160));
    },
  });

  return (
    <div className="p-6">
      <h1 className="mb-1 text-2xl font-bold">Resume checker</h1>
      <p className="mb-4 text-sm text-muted-foreground">Score your base resume against a specific job description.</p>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Inputs</CardTitle>
            <CardDescription>Paste a JD to score keyword and responsibility match.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              rows={10}
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="Paste the full job description here."
              className={jdBlocked ? "border-amber-500/60 focus-visible:ring-amber-500/40" : ""}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="text-muted-foreground">
                {jdEmpty
                  ? <>Paste a JD to score your resume against it.</>
                  : <>{jdLen.toLocaleString()} chars · {jdWordCount.toLocaleString()} words</>}
              </div>
              {jdTooShort && (
                <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-600">
                  Need &ge; {MIN_JD} chars for a useful match ({MIN_JD - jdLen} to go)
                </span>
              )}
              {jdTooLong && (
                <span className="rounded-full border border-red-500/50 bg-red-500/10 px-2 py-0.5 font-medium text-red-600">
                  Over {MAX_JD.toLocaleString()} char limit
                </span>
              )}
            </div>
            <Button onClick={() => runAll.mutate()} disabled={runAll.isPending || !resume || jdBlocked}>
              <ClipboardCheck className="mr-1.5 h-4 w-4" />
              {runAll.isPending ? "Scoring..." : "Score against JD"}
            </Button>
            {!resume && (
              <p className="text-xs text-muted-foreground">Upload a base resume first to enable checks.</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {errText && (
            <Card className="border-red-500/40">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-red-600 text-base">
                  <AlertTriangle className="h-4 w-4" /> Check failed
                </CardTitle>
                <CardDescription>Full error from the server (not a generic message).</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-[11px]">{errText}</pre>
              </CardContent>
            </Card>
          )}
          {scoreReport && (
            <Card>
              <CardHeader><CardTitle>JD match: {scoreReport.score}/100</CardTitle><CardDescription>{scoreReport.summary}</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                <Progress value={scoreReport.score} />
                <Section title="Strengths" items={scoreReport.strengths} />
                <Section title="Gaps" items={scoreReport.gaps} />
                <Section title="Missing keywords" items={scoreReport.missing_keywords} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">{title}</div>
      <ul className="list-disc space-y-0.5 pl-5 text-sm">{items.map((s, i) => <li key={i}>{s}</li>)}</ul>
    </div>
  );
}
