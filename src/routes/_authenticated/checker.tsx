import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { runAtsCheck, scoreResume } from "@/lib/ai-generate.functions";
import { getBaseResume } from "@/lib/resumes.functions";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { ClipboardCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/checker")({ component: CheckerPage });

function CheckerPage() {
  const getBase = useServerFn(getBaseResume);
  const ats = useServerFn(runAtsCheck);
  const score = useServerFn(scoreResume);
  const { data: resume } = useQuery({ queryKey: ["resume","base"], queryFn: () => getBase() });
  const [jd, setJd] = useState("");
  const [scoreReport, setScoreReport] = useState<any>(null);
  const [atsReport, setAtsReport] = useState<any>(null);

  const runAll = useMutation({
    mutationFn: async () => {
      const results: any = {};
      results.ats = await ats({ data: {} } as any);
      if (jd.length > 30) results.score = await score({ data: { jd } } as any);
      return results;
    },
    onSuccess: (r: any) => {
      setAtsReport(r.ats?.report ?? null);
      setScoreReport(r.score?.report ?? null);
      toast.success("Checks complete");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-6">
      <h1 className="mb-1 text-2xl font-bold">Resume checker</h1>
      <p className="mb-4 text-sm text-muted-foreground">Run an ATS audit and optionally score your resume against a specific JD.</p>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Inputs</CardTitle>
            <CardDescription>Optional JD for keyword/responsibility match.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea rows={10} value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Paste JD (optional)" />
            <Button onClick={() => runAll.mutate()} disabled={runAll.isPending || !resume}>
              <ClipboardCheck className="mr-1.5 h-4 w-4" />{runAll.isPending ? "Running..." : "Run checks"}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {atsReport && (
            <Card>
              <CardHeader><CardTitle>ATS score: {atsReport.ats_score}/100</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Progress value={atsReport.ats_score} />
                <Section title="Issues" items={atsReport.issues} />
                <Section title="Recommendations" items={atsReport.recommendations} />
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
