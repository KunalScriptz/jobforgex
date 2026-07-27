import { useState } from "react";
import { toast } from "sonner";
import { aiApi, AiGenerateResult } from "@/api/ai";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ShieldCheck } from "lucide-react";

export default function CheckerPage() {
  const [resume, setResume] = useState("");
  const [jd, setJd] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiGenerateResult | null>(null);

  const handleCheck = async () => {
    if (!resume || !jd) return;
    setLoading(true);
    try {
      const data = await aiApi.generate({
        prompt_name: "ats_checker",
        vars: { resume_text: resume, job_description: jd },
        purpose: "ats_check",
      });
      setResult(data);
      toast.success("ATS check complete");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Check failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">ATS Checker</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Your Resume</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={resume}
              onChange={(e) => setResume(e.target.value)}
              rows={16}
              placeholder="Paste your resume text here..."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Job Description</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              rows={16}
              placeholder="Paste the job description here..."
            />
          </CardContent>
        </Card>
      </div>

      <Button onClick={handleCheck} disabled={loading || !resume || !jd} className="w-full" size="lg">
        <ShieldCheck className="mr-2 h-5 w-5" />
        {loading ? "Analyzing..." : "Check ATS Score"}
      </Button>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>ATS Score Results</CardTitle>
            <CardDescription>
              Tokens: {result.input_tokens + result.output_tokens} | Cost: ${result.total_cost.toFixed(4)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea value={result.content} readOnly rows={16} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
