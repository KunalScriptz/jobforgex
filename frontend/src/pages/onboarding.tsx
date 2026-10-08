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
import { usersApi } from "@/api/users";
import { Sparkles, CheckCircle2, ArrowLeft } from "lucide-react";
import { PdfToLatexButton } from "@/components/pdf-to-latex-button";
import { PageTitle } from "@/components/page-title";
import { CityAutocomplete } from "@/components/city-autocomplete";
import { LatexPreview } from "@/components/latex-preview";
import logoImg from "@/assets/logo.png";

const CURRENCIES = ["INR", "USD", "AED", "EUR", "GBP", "SGD", "MYR", "AUD", "CAD", "SAR", "QAR", "OMR", "JPY", "HKD", "NZD"];

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
      if (ws.onboarding_complete) navigate("/overview");
      else setStep(ws.onboarding_step ?? 1);
    }
  }, [ws, navigate]);

  const progress = ((step - 1) / 3) * 100;

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <PageTitle title="Setup" />
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <img src={logoImg} alt="JobForge" className="h-4 w-4" />
          JobForge setup — step {step} of 3
        </div>
        <Progress value={progress} className="mb-6" />

        {step === 1 && <Step1 onDone={(_ws) => { qc.invalidateQueries({ queryKey: ["ws"] }); setStep(2); }} />}
        {step === 2 && <Step3
          onBack={() => setStep(1)}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ["ws"] });
            setStep(3);
          }}
        />}
        {step === 3 && <ProfileStep
          onBack={() => setStep(2)}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ["ws"] });
            sessionStorage.setItem("jobforge_guide_pending", "1");
            navigate("/overview");
          }}
        />}
      </div>
    </div>
  );
}

function Step1({ onDone }: { onDone: (ws: any) => void }) {
  const [name, setName] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setName(`${new Date().getFullYear()} Job Search`); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const [ws] = await Promise.all([
        workspaceApi.createWorkspace({ name, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
        fullName.trim() ? usersApi.updateMe({ full_name: fullName.trim() }) : Promise.resolve(),
      ]);
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
          <div>
            <Label htmlFor="uname">Your name</Label>
            <Input id="uname" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={150} placeholder="e.g. Revathi Shree" />
            <p className="mt-1 text-xs text-muted-foreground">Used on generated resumes and cover letters.</p>
          </div>
          <Button type="submit" disabled={busy}>{busy ? "Creating..." : "Continue"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Step3({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const qc = useQueryClient();
  const [tex, setTex] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [busy, setBusy] = useState(false);

  const isValid = tex.includes("\\documentclass") && tex.includes("\\begin{document}") && tex.includes("\\end{document}");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) { toast.error("Please upload a valid LaTeX resume before continuing."); return; }
    setBusy(true);
    try {
      await resumesApi.saveBaseResume({
        latex_source: tex,
        ...(templateName.trim() ? { name: templateName.trim() } : {}),
      });
      qc.invalidateQueries({ queryKey: ["resumes"] });
      await workspaceApi.updateOnboarding(3, false);
      toast.success("Resume saved!");
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
          <div>
            <Label htmlFor="tpl-name">Template name (optional)</Label>
            <Input
              id="tpl-name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="My Resume"
              maxLength={100}
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              e.g. UAE_Standard_Resume. You can add more templates and rename them later.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-md border border-dashed bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">
              Only have a PDF? Import it and we'll rewrite it into LaTeX for you.
            </div>
            <PdfToLatexButton onLatex={(l) => setTex(l)} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="min-w-0">
              <Textarea
                className="h-[480px] font-mono text-xs"
                value={tex}
                onChange={(e) => setTex(e.target.value)}
                placeholder="\documentclass[letterpaper,11pt]{article}&\#10;..."
              />
              {tex.length > 0 && !isValid && (
                <p className="mt-1 text-xs text-amber-500">Your LaTeX must include \documentclass, \begin{"{document}"}, and \end{"{document}"} to be valid.</p>
              )}
            </div>
            <div className="h-[480px] overflow-hidden rounded-md border bg-background">
              <LatexPreview source={tex} cacheKey="onboarding-resume" debounceMs={1500} />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Button type="button" variant="outline" onClick={onBack} disabled={busy}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
            </Button>
            <Button type="submit" disabled={busy || !isValid}>
              {busy ? "Saving..." : "Continue"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ProfileStep({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [salary, setSalary] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [frequency, setFrequency] = useState("annual");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!location.trim()) { toast.error("Please add your current location."); return; }
    setBusy(true);
    try {
      const amount = salary.trim() ? Number(salary) : null;
      await usersApi.updateMe({
        current_salary: amount !== null && Number.isFinite(amount) ? amount : null,
        salary_currency: amount !== null && Number.isFinite(amount) ? currency : null,
        salary_frequency: amount !== null && Number.isFinite(amount) ? frequency : null,
        location: location.trim(),
      });
      await workspaceApi.updateOnboarding(4, true);
      toast.success("Setup complete!");
      onDone();
    } catch (err: any) { toast.error(err.message ?? "Failed"); }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>About you</CardTitle>
        <CardDescription>So Ask AI can tailor salary and relocation answers to your situation. You can change these anytime in Settings.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="loc">Current location</Label>
            <div className="mt-1">
              <CityAutocomplete
                value={location}
                onChange={setLocation}
                placeholder="e.g. Bengaluru, India"
                required
              />
            </div>
          </div>
          <div>
            <Label>Current salary (optional)</Label>
            <div className="mt-1 flex gap-2">
              <Input
                type="number"
                min={0}
                step="any"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                placeholder="e.g. 1200000"
                className="flex-1"
              />
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="annual">Annual</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Leave blank if you'd rather not share.</p>
          </div>
          <div className="flex items-center justify-between">
            <Button type="button" variant="outline" onClick={onBack} disabled={busy}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : (<><CheckCircle2 className="mr-1.5 h-4 w-4" />Finish setup</>)}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
