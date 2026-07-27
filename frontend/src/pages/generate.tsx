import { useState } from "react";
import { toast } from "sonner";
import { aiApi, AiGenerateResult } from "@/api/ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Sparkles, FileText, Mail } from "lucide-react";

export default function GeneratePage() {
  const [jd, setJd] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{
    tailored?: AiGenerateResult;
    coverLetter?: AiGenerateResult;
  }>({});

  const handleGenerate = async () => {
    if (!jd) return;
    setLoading(true);
    try {
      const [tailored, coverLetter] = await Promise.all([
        aiApi.generate({
          prompt_name: "tailor_resume",
          vars: { job_description: jd, job_title: jobTitle, company },
          purpose: "resume_tailoring",
        }),
        aiApi.generate({
          prompt_name: "generate_cover_letter",
          vars: { job_description: jd, job_title: jobTitle, company },
          purpose: "cover_letter",
        }),
      ]);
      setResults({ tailored, coverLetter });
      toast.success("Generation complete");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Generate</h1>

      <Card>
        <CardHeader>
          <CardTitle>Job Description</CardTitle>
          <CardDescription>Paste the job description to tailor your resume and generate a cover letter.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Job Title</Label>
              <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Software Engineer" />
            </div>
            <div>
              <Label>Company</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Inc" />
            </div>
          </div>
          <div>
            <Label>Job Description *</Label>
            <Textarea
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              rows={12}
              placeholder="Paste the full job description here..."
            />
          </div>
          <Button onClick={handleGenerate} disabled={loading || !jd} className="w-full">
            <Sparkles className="mr-2 h-4 w-4" />
            {loading ? "Generating..." : "Generate Tailored Resume & Cover Letter"}
          </Button>
        </CardContent>
      </Card>

      {results.tailored && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> Tailored Resume (LaTeX)
            </CardTitle>
            <CardDescription>
              Tokens: {results.tailored.input_tokens + results.tailored.output_tokens} | Cost: ${results.tailored.total_cost.toFixed(4)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea value={results.tailored.content} readOnly rows={20} className="font-mono text-sm" />
          </CardContent>
        </Card>
      )}

      {results.coverLetter && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" /> Cover Letter
            </CardTitle>
            <CardDescription>
              Tokens: {results.coverLetter.input_tokens + results.coverLetter.output_tokens} | Cost: ${results.coverLetter.total_cost.toFixed(4)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea value={results.coverLetter.content} readOnly rows={16} className="text-sm" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
