import { useParams } from "react-router-dom";
import { useState } from "react";
import { toast } from "sonner";
import { aiApi } from "@/api/ai";
import { useJobDetail } from "@/hooks/use-jobs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export default function BuilderPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const { data: jobDetail, isLoading } = useJobDetail(jobId || "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleBuild = async (action: string) => {
    setLoading(true);
    try {
      const jd = jobDetail?.job?.description || "";
      const data = await aiApi.generate({
        prompt_name: action,
        vars: { job_description: jd, job_title: jobDetail?.job?.title || "", company: jobDetail?.job?.company || "" },
        job_id: jobId,
        purpose: "custom",
      });
      setResult(data.content);
      toast.success("Builder generated");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Build failed");
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  const job = jobDetail?.job;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Resume Builder</h1>

      {job && (
        <Card>
          <CardHeader>
            <CardTitle>{job.company} — {job.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => handleBuild("builder_seed")} disabled={loading} variant="outline">
                Seed from JD
              </Button>
              <Button onClick={() => handleBuild("builder_job_match")} disabled={loading} variant="outline">
                Analyze Match
              </Button>
              <Button onClick={() => handleBuild("builder_score")} disabled={loading} variant="outline">
                Score Resume
              </Button>
              <Button onClick={() => handleBuild("builder_suggestions")} disabled={loading} variant="outline">
                Get Suggestions
              </Button>
            </div>
            {loading && <div className="text-sm text-muted-foreground">Generating...</div>}
            {result && (
              <div className="mt-4">
                <Label>Result</Label>
                <Textarea value={result} readOnly rows={16} />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
