import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { getMyWorkspace, createWorkspace, updateOnboardingStep } from "@/lib/workspace.functions";
import { saveProvider, testConnection } from "@/lib/ai-config.functions";
import { saveBaseResume } from "@/lib/resumes.functions";
import { Sparkles, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  component: OnboardingPage,
  head: () => ({ meta: [{ title: "Setup — JobForge" }] }),
});

function OnboardingPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getWs = useServerFn(getMyWorkspace);
  const setStepFn = useServerFn(updateOnboardingStep);
  const { data: ws, isLoading } = useQuery({ queryKey: ["ws"], queryFn: () => getWs() });
  const [step, setStep] = useState(1);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) navigate({ to: "/auth" });
    });
  }, [navigate]);

  useEffect(() => {
    if (ws) {
      if (ws.onboarding_complete) navigate({ to: "/jobs" });
      else setStep(ws.onboarding_step ?? 1);
    }
  }, [ws, navigate]);

  // No blocking loader — Step 1 renders instantly for new users

  const progress = ((step - 1) / 3) * 100;

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          JobForge setup — step {step} of 3
        </div>
        <Progress value={progress} className="mb-6" />

        {step === 1 && <Step1 onDone={(_ws) => { qc.invalidateQueries({ queryKey: ["ws"] }); setStep(2); }} />}
        {step === 2 && <Step2 onDone={async () => {
          await setStepFn({ data: { step: 3 } } as any);
          qc.invalidateQueries({ queryKey: ["ws"] }); setStep(3);
        }} />}
        {step === 3 && <Step3 onDone={async () => {
          qc.invalidateQueries({ queryKey: ["ws"] });
          navigate({ to: "/jobs" });
        }} />}
      </div>
    </div>
  );
}

function FullScreenLoader() {
  return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading...</div>;
}

function Step1({ onDone }: { onDone: (ws: any) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const create = useServerFn(createWorkspace);

  useEffect(() => { setName(`${new Date().getFullYear()} Job Search`); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const ws = await create({ data: { name, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } } as any);
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

function Step2({ onDone }: { onDone: () => void }) {
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com/v1");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("deepseek-chat");
  const [busy, setBusy] = useState(false);
  const test = useServerFn(testConnection);
  const save = useServerFn(saveProvider);

  const DEFAULT_MODELS = [
    { name: "deepseek-chat", display: "DeepSeek Chat" },
    { name: "deepseek-coder", display: "DeepSeek Coder" },
    { name: "deepseek-reasoner", display: "DeepSeek Reasoner" },
  ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const cleanKey = apiKey.trim();
      const cleanUrl = baseUrl.trim();
      const cleanModel = model.trim();
      if (cleanKey.length < 10) throw new Error("Paste your full API key (min 10 chars). It usually starts with sk-...");
      await test({ data: { base_url: cleanUrl, api_key: cleanKey, model: cleanModel } } as any);
      await save({ data: { base_url: cleanUrl, api_key: cleanKey, name: "DeepSeek" } } as any);
      toast.success("Connection verified");
      onDone();
    } catch (err: any) {
      const raw = err?.message ?? String(err);
      // Zod validation errors arrive as a JSON array — surface the first message.
      let pretty = raw;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed[0]?.message) pretty = parsed.map((p: any) => `• ${p.path?.join(".")}: ${p.message}`).join("\n");
      } catch {}
      toast.error(pretty.slice(0, 300));
      // eslint-disable-next-line no-alert
      console.error("[onboarding] provider test failed:", raw);
    }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configure your AI provider</CardTitle>
        <CardDescription>Your key is encrypted at rest and only decrypted server-side.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Provider</Label>
            <Input value="OpenAI Compatible" disabled />
          </div>
          <div>
            <Label htmlFor="url">API base URL</Label>
            <Input id="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="key">API key</Label>
            <Input id="key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} required minLength={10} placeholder="sk-..." />
          </div>
          <div>
            <Label htmlFor="model">Default model</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger id="model"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEFAULT_MODELS.map((m) => (
                  <SelectItem key={m.name} value={m.name}>{m.display} <span className="text-muted-foreground">({m.name})</span></SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">You can add more models later in Settings.</p>
          </div>
          <Button type="submit" disabled={busy}>{busy ? "Testing..." : "Test & save"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Step3({ onDone }: { onDone: () => void }) {
  const [tex, setTex] = useState("");
  const [busy, setBusy] = useState(false);
  const save = useServerFn(saveBaseResume);
  const finish = useServerFn(updateOnboardingStep);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (tex.length < 100) { toast.error("Paste your full LaTeX resume"); return; }
    setBusy(true);
    try {
      await save({ data: { latex_source: tex } } as any);
      await finish({ data: { step: 4, complete: true } } as any);
      toast.success("Setup complete!");
      onDone();
    } catch (err: any) { toast.error(err.message ?? "Failed"); }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload your base resume</CardTitle>
        <CardDescription>Paste the complete LaTeX source. 1 page or many — we preserve the length.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <Textarea
            className="h-80 font-mono text-xs"
            value={tex}
            onChange={(e) => setTex(e.target.value)}
            placeholder="\documentclass[letterpaper,11pt]{article}&#10;..."
          />
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">{tex.length.toLocaleString()} characters</div>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : (<><CheckCircle2 className="mr-1.5 h-4 w-4" />Finish setup</>)}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}