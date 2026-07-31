import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/context/auth-context";
import { workspaceApi } from "@/api/workspace";
import { resumesApi } from "@/api/resumes";
import { Sparkles, CheckCircle2, ArrowLeft } from "lucide-react";
import { PdfToLatexButton } from "@/components/pdf-to-latex-button";
import { PageTitle } from "@/components/page-title";
import logoImg from "@/assets/logo.png";

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const qc = useQueryClient();
  const { data: ws, isLoading } = useQuery({ queryKey: ["ws"], queryFn: () => workspaceApi.getMyWorkspace() });
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (!isAuthenticated) navigate("/auth");
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (ws) {
      if (ws.onboarding_complete) navigate("/jobs");
      else setStep(ws.onboarding_step ?? 1);
    }
  }, [ws, navigate]);

  const progress = ((step - 1) / 2) * 100;

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <PageTitle title="Setup" />
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <img src={logoImg} alt="JobForge" className="h-4 w-4" />
          JobForge setup — step {step} of 2
        </div>
        <Progress value={progress} className="mb-6" />

        {step === 1 && <Step1 onDone={(_ws) => { qc.invalidateQueries({ queryKey: ["ws"] }); setStep(2); }} />}
        {step === 2 && <Step3
          onBack={() => setStep(1)}
          onDone={async () => {
            qc.invalidateQueries({ queryKey: ["ws"] });
            navigate("/jobs");
          }}
        />}
      </div>
    </div>
  );
}

function Step1({ onDone }: { onDone: (ws: any) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setName(`${new Date().getFullYear()} Job Search`); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const ws = await workspaceApi.createWorkspace({ name, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      toast.success("Workspace created");
      onDone(ws);
    } catch (err: any) { toast.error(err.message ?? "Failed"); }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your private workspace is ready.</CardTitle>
        <CardDescription>Give it a name — you can change this later.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="wname">Workspace name</Label>
            <Input id="wname" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
          </div>
          <Button type="submit" disabled={busy}>{busy ? "Creating..." : "Continue"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Step3({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [tex, setTex] = useState("");
  const [busy, setBusy] = useState(false);

  const isValid = tex.includes("\\documentclass") && tex.includes("\\begin{document}") && tex.includes("\\end{document}");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) { toast.error("Please upload a valid LaTeX resume before finishing."); return; }
    setBusy(true);
    try {
      await resumesApi.saveBaseResume({ latex_source: tex });
      await workspaceApi.updateOnboarding(4, true);
      toast.success("Setup complete!");
      onDone();
    } catch (err: any) { toast.error(err.message ?? "Failed"); }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload your base resume</CardTitle>
        <CardDescription>Paste the complete LaTeX source, or import from a PDF and we'll convert it into our LaTeX template.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="flex items-center justify-between rounded-md border border-dashed bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">
              Only have a PDF? Import it and we'll rewrite it into LaTeX for you.
            </div>
            <PdfToLatexButton onLatex={(l) => setTex(l)} />
          </div>
          <Textarea
            className="h-80 font-mono text-xs"
            value={tex}
            onChange={(e) => setTex(e.target.value)}
            placeholder="\documentclass[letterpaper,11pt]{article}&\#10;..."
          />
          {tex.length > 0 && !isValid && (
            <p className="text-xs text-amber-500">Your LaTeX must include \documentclass, \begin{"{document}"}, and \end{"{document}"} to be valid.</p>
          )}
          <div className="flex items-center justify-between">
            <Button type="button" variant="outline" onClick={onBack} disabled={busy}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
            </Button>
            <Button type="submit" disabled={busy || !isValid}>
              {busy ? "Saving..." : (<><CheckCircle2 className="mr-1.5 h-4 w-4" />Finish setup</>)}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
