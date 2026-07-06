import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { getMyWorkspace, updateBudget, listBoards, createBoard, renameBoard, deleteBoard } from "@/lib/workspace.functions";
import { getProvider, saveProvider, testConnection, pingSavedModel, listModels, upsertModel, deleteModel } from "@/lib/ai-config.functions";
import { listExtensionTokens, createExtensionToken, revokeExtensionToken } from "@/lib/extension.functions";

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, PlugZap, CheckCircle2, XCircle, AlertTriangle, Sparkles, Loader2 } from "lucide-react";
import { Chrome, Download, Copy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });

function SettingsPage() {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <ProviderCard />
      <ModelsCard />
      <BoardsCard />
      <BudgetCard />
      <ExtensionCard />
    </div>
  );
}

function ExtensionCard() {
  const qc = useQueryClient();
  const listFn = useServerFn(listExtensionTokens);
  const createFn = useServerFn(createExtensionToken);
  const revokeFn = useServerFn(revokeExtensionToken);
  const { data: tokens = [] } = useQuery({ queryKey: ["ext-tokens"], queryFn: () => listFn() });
  const [freshToken, setFreshToken] = useState<string>("");
  const create = useMutation({
    mutationFn: async () => createFn({ data: { label: "Chrome extension" } } as any),
    onSuccess: (r: any) => { setFreshToken(r.token); qc.invalidateQueries({ queryKey: ["ext-tokens"] }); toast.success("Token generated"); },
    onError: (e: any) => toast.error(String(e?.message ?? e).slice(0, 200)),
  });
  const revoke = useMutation({
    mutationFn: async (id: string) => revokeFn({ data: { id } } as any),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ext-tokens"] }); toast.success("Revoked"); },
  });

  async function downloadExtension() {
    try {
      const res = await fetch("/jobforge-extension.zip");
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "jobforge-extension.zip";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Chrome className="h-4 w-4" /> Chrome extension</CardTitle>
        <CardDescription>Save jobs to your board with one click from any job posting.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={downloadExtension}><Download className="mr-1.5 h-4 w-4" /> Download extension (.zip)</Button>
          <Button size="sm" variant="outline" onClick={() => create.mutate()} disabled={create.isPending}>
            <Plus className="mr-1.5 h-4 w-4" /> Generate connect token
          </Button>
        </div>
        {freshToken && (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
            <div className="mb-1 font-medium">Copy this token — you won't see it again:</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-auto rounded bg-background px-2 py-1 font-mono text-xs">{freshToken}</code>
              <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(freshToken); toast.success("Copied"); }}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          <div className="mb-1 font-semibold text-foreground">Install</div>
          <ol className="list-decimal space-y-0.5 pl-4">
            <li>Unzip the downloaded file.</li>
            <li>Open <code>chrome://extensions</code> and enable Developer mode.</li>
            <li>Click Load unpacked and pick the unzipped folder.</li>
            <li>Click the extension icon → Connect → paste your token.</li>
          </ol>
        </div>
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active tokens</div>
          {tokens.length === 0 && <div className="text-xs text-muted-foreground">No tokens yet.</div>}
          {tokens.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between rounded border p-2 text-xs">
              <div><span className="font-mono">{t.token_prefix}…</span> · {t.label} · {new Date(t.created_at).toLocaleDateString()}</div>
              <Button size="sm" variant="ghost" onClick={() => revoke.mutate(t.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ProviderCard() {
  const qc = useQueryClient();
  const get = useServerFn(getProvider);
  const save = useServerFn(saveProvider);
  const test = useServerFn(testConnection);
  const pingSaved = useServerFn(pingSavedModel);
  const { data: p } = useQuery({ queryKey: ["provider"], queryFn: () => get() });
  const PRESETS: Record<string, { name: string; base_url: string; test_model: string; key_hint: string; docs: string }> = {
    deepseek:   { name: "DeepSeek",   base_url: "https://api.deepseek.com/v1",   test_model: "deepseek-chat",              key_hint: "sk-...",   docs: "https://platform.deepseek.com/api_keys" },
    openrouter: { name: "OpenRouter", base_url: "https://openrouter.ai/api/v1",  test_model: "openai/gpt-4o-mini",         key_hint: "sk-or-...", docs: "https://openrouter.ai/keys" },
    custom:     { name: "Custom",     base_url: "",                              test_model: "",                            key_hint: "sk-...",   docs: "" },
  };
  const detectPreset = (url?: string): keyof typeof PRESETS => {
    if (!url) return "deepseek";
    if (url.includes("openrouter.ai")) return "openrouter";
    if (url.includes("deepseek.com")) return "deepseek";
    return "custom";
  };
  const [preset, setPreset] = useState<keyof typeof PRESETS>("deepseek");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("deepseek-chat");
  const [testReply, setTestReply] = useState<string>("");
  const [testError, setTestError] = useState<string>("");

  useEffect(() => {
    if (p) {
      setBaseUrl(p.base_url);
      const detected = detectPreset(p.base_url);
      setPreset(detected);
      if (detected !== "custom") setModel(PRESETS[detected].test_model);
    }
  }, [p]);

  function applyPreset(id: keyof typeof PRESETS) {
    setPreset(id);
    const cfg = PRESETS[id];
    if (id !== "custom") {
      setBaseUrl(cfg.base_url);
      setModel(cfg.test_model);
    }
  }

  const submit = useMutation({
    mutationFn: async () => {
      setTestReply("");
      setTestError("");
      const cleanKey = apiKey.trim();
      await save({ data: { base_url: baseUrl.trim(), api_key: cleanKey || undefined, name: PRESETS[preset].name } } as any);
      if (!cleanKey) return null;
      try {
        return await pingSaved({ data: { model: model.trim() } } as any);
      } catch (e: any) {
        throw new Error(`Key was saved, but the model test failed:\n${e?.message ?? String(e)}`);
      }
    },
    onSuccess: (r: any) => {
      const reply = r?.reply ?? "";
      if (reply) setTestReply(reply);
      toast.success(reply ? `Saved. Model replied: ${reply.slice(0, 80)}` : "Saved");
      qc.invalidateQueries({ queryKey: ["provider"] });
      setApiKey("");
    },
    onError: (e: any) => { setTestError(e?.message ?? String(e)); toast.error("Save/test failed — see full error"); },
  });

  const runTest = useMutation({
    mutationFn: async () => pingSaved({ data: { model } } as any),
    onSuccess: (r: any) => {
      const reply = r?.reply ?? "";
      setTestReply(reply);
      setTestError("");
      toast.success(`Model replied: ${reply.slice(0, 80)}`);
    },
    onError: (e: any) => {
      setTestReply("");
      setTestError(e?.message ?? e?.toString?.() ?? "Unknown error");
      toast.error("Test failed — see full error below");
    },
  });

  const status: "empty" | "saved" | "ok" | "err" =
    testError ? "err" : testReply ? "ok" : p?.has_key ? "saved" : "empty";

  return (
    <Card className="overflow-hidden border-border/60 bg-gradient-to-br from-card via-card to-primary/5">
      <CardHeader className="border-b border-border/60 bg-background/30 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> AI provider
            </CardTitle>
          <CardDescription>Your key is encrypted at rest. Paste a new key to replace it, then save and test.</CardDescription>
          </div>
          <StatusPill status={status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        <div>
          <Label>Provider</Label>
          <Select value={preset} onValueChange={(v) => applyPreset(v as keyof typeof PRESETS)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="deepseek">DeepSeek</SelectItem>
              <SelectItem value="openrouter">OpenRouter</SelectItem>
              <SelectItem value="custom">Custom (OpenAI-compatible)</SelectItem>
            </SelectContent>
          </Select>
          {preset === "openrouter" && (
            <p className="mt-1 text-xs text-muted-foreground">
              OpenRouter model ids look like <code>openai/gpt-4o-mini</code>, <code>anthropic/claude-3.5-sonnet</code>, <code>meta-llama/llama-3.1-70b-instruct</code>. Get a key at{" "}
              <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="underline">openrouter.ai/keys</a>.
            </p>
          )}
        </div>
        <div><Label>Base URL</Label><Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.deepseek.com/v1" /></div>
        <div>
          <Label>API key {p?.has_key ? <span className="text-xs text-emerald-600">✓ saved</span> : null}</Label>
          <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={p?.has_key ? "•••••••• (leave blank to keep)" : PRESETS[preset].key_hint} />
        </div>
        <div><Label>Test model</Label><Input value={model} onChange={(e) => setModel(e.target.value)} /></div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
            {submit.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{apiKey.trim() ? "Save & test" : "Save"}
          </Button>
          <Button variant="secondary" onClick={() => runTest.mutate()} disabled={runTest.isPending || !p?.has_key}>
            {runTest.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PlugZap className="mr-1.5 h-4 w-4" />}
            {runTest.isPending ? "Testing…" : "Test model"}
          </Button>
        </div>

        {testReply && (
          <div className="animate-in fade-in slide-in-from-top-1 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" /> Model reply
            </div>
            <div className="font-mono text-sm">{testReply}</div>
          </div>
        )}

        {testError && (
          <div className="animate-in fade-in slide-in-from-top-1 rounded-lg border border-red-500/40 bg-red-500/5 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-red-600">
              <AlertTriangle className="h-3.5 w-3.5" /> Full server error
            </div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-background/60 p-2 text-[11px] leading-relaxed">
              {testError}
            </pre>
            <div className="mt-2 text-[11px] text-muted-foreground">
              Tip: if this says 401/Authentication, the provider rejected the saved key/model/base URL. The card above shows the exact URL, model, key length, and response body.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusPill({ status }: { status: "empty" | "saved" | "ok" | "err" }) {
  const map = {
    empty: { icon: AlertTriangle, text: "Not configured", cls: "border-amber-500/40 bg-amber-500/10 text-amber-600" },
    saved: { icon: CheckCircle2,  text: "Key saved",      cls: "border-sky-500/40 bg-sky-500/10 text-sky-600" },
    ok:    { icon: CheckCircle2,  text: "Model OK",       cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600" },
    err:   { icon: XCircle,       text: "Error",          cls: "border-red-500/40 bg-red-500/10 text-red-600" },
  }[status];
  const Icon = map.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${map.cls}`}>
      <Icon className="h-3 w-3" /> {map.text}
    </span>
  );
}

function ModelsCard() {
  const qc = useQueryClient();
  const get = useServerFn(listModels);
  const upsert = useServerFn(upsertModel);
  const del = useServerFn(deleteModel);
  const { data: models = [] } = useQuery({ queryKey: ["models"], queryFn: () => get() });
  const [form, setForm] = useState<any>({ name: "", display_name: "", input_price_per_1m: 0.14, output_price_per_1m: 0.28, is_default: false });

  return (
    <Card>
      <CardHeader><CardTitle>Models</CardTitle><CardDescription>Names must match your provider's model IDs. Prices are per 1M tokens.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground"><tr><th className="p-2 text-left">Name</th><th className="p-2 text-left">Display</th><th className="p-2 text-right">In $/M</th><th className="p-2 text-right">Out $/M</th><th className="p-2">Default</th><th></th></tr></thead>
            <tbody>
              {models.map((m: any) => (
                <ModelRow key={m.id} model={m} onSave={(d: any) => upsert({ data: d } as any).then(() => qc.invalidateQueries({ queryKey: ["models"] }))} onDelete={() => del({ data: { id: m.id } } as any).then(() => qc.invalidateQueries({ queryKey: ["models"] }))} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-5 gap-2">
          <Input placeholder="model-id" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Display name" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          <Input type="number" step="0.01" value={form.input_price_per_1m} onChange={(e) => setForm({ ...form, input_price_per_1m: Number(e.target.value) })} />
          <Input type="number" step="0.01" value={form.output_price_per_1m} onChange={(e) => setForm({ ...form, output_price_per_1m: Number(e.target.value) })} />
          <Button onClick={async () => { await upsert({ data: form } as any); qc.invalidateQueries({ queryKey: ["models"] }); toast.success("Added"); setForm({ ...form, name: "", display_name: "" }); }}>
            <Plus className="mr-1 h-4 w-4" />Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ModelRow({ model, onSave, onDelete }: any) {
  const [f, setF] = useState(model);
  useEffect(() => setF(model), [model.id]);
  return (
    <tr className="border-t">
      <td className="p-1"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="h-8" /></td>
      <td className="p-1"><Input value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} className="h-8" /></td>
      <td className="p-1"><Input type="number" step="0.01" value={f.input_price_per_1m} onChange={(e) => setF({ ...f, input_price_per_1m: Number(e.target.value) })} className="h-8 text-right" /></td>
      <td className="p-1"><Input type="number" step="0.01" value={f.output_price_per_1m} onChange={(e) => setF({ ...f, output_price_per_1m: Number(e.target.value) })} className="h-8 text-right" /></td>
      <td className="p-1 text-center"><Checkbox checked={f.is_default} onCheckedChange={(v) => setF({ ...f, is_default: !!v })} /></td>
      <td className="p-1 text-right whitespace-nowrap">
        <Button size="sm" variant="ghost" onClick={() => onSave({ id: f.id, name: f.name, display_name: f.display_name, input_price_per_1m: Number(f.input_price_per_1m), output_price_per_1m: Number(f.output_price_per_1m), is_default: f.is_default })}>Save</Button>
        <Button size="sm" variant="ghost" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
      </td>
    </tr>
  );
}

function BoardsCard() {
  const qc = useQueryClient();
  const get = useServerFn(listBoards);
  const add = useServerFn(createBoard);
  const ren = useServerFn(renameBoard);
  const del = useServerFn(deleteBoard);
  const { data: boards = [] } = useQuery({ queryKey: ["boards"], queryFn: () => get() });
  const [name, setName] = useState("");

  return (
    <Card>
      <CardHeader><CardTitle>Boards</CardTitle><CardDescription>Group your jobs by year, focus, or campaign.</CardDescription></CardHeader>
      <CardContent>
        <div className="space-y-2">
          {boards.map((b: any) => (
            <div key={b.id} className="flex items-center gap-2">
              <Input defaultValue={b.name} onBlur={(e) => e.target.value !== b.name && ren({ data: { id: b.id, name: e.target.value } } as any).then(() => qc.invalidateQueries({ queryKey: ["boards"] }))} />
              <Button size="sm" variant="ghost" onClick={() => del({ data: { id: b.id } } as any).then(() => qc.invalidateQueries({ queryKey: ["boards"] }))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Input placeholder="New board name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button onClick={async () => { if (!name) return; await add({ data: { name } } as any); qc.invalidateQueries({ queryKey: ["boards"] }); setName(""); }}><Plus className="h-4 w-4" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}

function BudgetCard() {
  const qc = useQueryClient();
  const getWs = useServerFn(getMyWorkspace);
  const upd = useServerFn(updateBudget);
  const { data: ws } = useQuery({ queryKey: ["ws"], queryFn: () => getWs() });
  const [b, setB] = useState<string>("");

  useEffect(() => { setB(ws?.monthly_budget_usd?.toString() ?? ""); }, [ws]);

  return (
    <Card>
      <CardHeader><CardTitle>Monthly budget</CardTitle><CardDescription>Get a warning on the Costs page when you approach it.</CardDescription></CardHeader>
      <CardContent className="flex items-end gap-2">
        <div className="flex-1"><Label>Budget (USD)</Label><Input type="number" step="1" value={b} onChange={(e) => setB(e.target.value)} placeholder="No budget" /></div>
        <Button onClick={async () => { await upd({ data: { monthly_budget_usd: b ? Number(b) : null } } as any); qc.invalidateQueries({ queryKey: ["ws"] }); toast.success("Saved"); }}>Save</Button>
      </CardContent>
    </Card>
  );
}