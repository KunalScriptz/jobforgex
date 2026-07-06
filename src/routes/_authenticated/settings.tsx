import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { getMyWorkspace, updateBudget, listBoards, createBoard, renameBoard, deleteBoard } from "@/lib/workspace.functions";
import { getProvider, saveProvider, testConnection, pingSavedModel, listModels, upsertModel, deleteModel } from "@/lib/ai-config.functions";

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Plus, PlugZap, CheckCircle2, XCircle, AlertTriangle, Sparkles, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });

function SettingsPage() {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <ProviderCard />
      <ModelsCard />
      <BoardsCard />
      <BudgetCard />
    </div>
  );
}

function ProviderCard() {
  const qc = useQueryClient();
  const get = useServerFn(getProvider);
  const save = useServerFn(saveProvider);
  const test = useServerFn(testConnection);
  const pingSaved = useServerFn(pingSavedModel);
  const { data: p } = useQuery({ queryKey: ["provider"], queryFn: () => get() });
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("deepseek-chat");
  const [testReply, setTestReply] = useState<string>("");
  const [testError, setTestError] = useState<string>("");

  useEffect(() => { if (p) setBaseUrl(p.base_url); }, [p]);

  const submit = useMutation({
    mutationFn: async () => {
      if (apiKey) await test({ data: { base_url: baseUrl, api_key: apiKey, model } } as any);
      await save({ data: { base_url: baseUrl, api_key: apiKey || "unchanged", name: "DeepSeek" } } as any);
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["provider"] }); setApiKey(""); },
    onError: (e: any) => { setTestError(e?.message ?? String(e)); toast.error("Save failed — see error card"); },
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
            <CardDescription>Your key is encrypted at rest. Leave blank to keep current key.</CardDescription>
          </div>
          <StatusPill status={status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        <div><Label>Base URL</Label><Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.deepseek.com/v1" /></div>
        <div>
          <Label>API key {p?.has_key ? <span className="text-xs text-emerald-600">✓ saved</span> : null}</Label>
          <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={p?.has_key ? "•••••••• (leave blank to keep)" : "sk-..."} />
        </div>
        <div><Label>Test model</Label><Input value={model} onChange={(e) => setModel(e.target.value)} /></div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
            {submit.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save
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
              Tip: if this says 401/Authentication, either the key is invalid, the model id is wrong, or your saved key was encrypted with a previous secret — paste the key again and Save.
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