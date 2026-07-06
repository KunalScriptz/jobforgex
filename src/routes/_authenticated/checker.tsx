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
*** Add File: src/routes/_authenticated/costs.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { LineChart, Line, PieChart, Pie, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

import { getCostSummary } from "@/lib/costs.functions";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/costs")({ component: CostsPage });

const COLORS = ["#00a698","#00008c","#f59e0b","#ef4444","#8b5cf6","#0ea5e9"];

function CostsPage() {
  const getSum = useServerFn(getCostSummary);
  const { data } = useQuery({ queryKey: ["costs"], queryFn: () => getSum() });
  const logs = data?.logs ?? [];
  const budget = data?.budget ? Number(data.budget) : null;

  const stats = useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0,0,0,0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    let today = 0, month = 0, total = 0;
    for (const l of logs) {
      const c = Number(l.total_cost);
      total += c;
      const t = new Date(l.created_at);
      if (t >= startOfDay) today += c;
      if (t >= startOfMonth) month += c;
    }
    return { today, month, total };
  }, [logs]);

  const byDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs) {
      const k = new Date(l.created_at).toISOString().slice(0,10);
      m.set(k, (m.get(k) ?? 0) + Number(l.total_cost));
    }
    return Array.from(m.entries()).sort().map(([date, cost]) => ({ date, cost: Number(cost.toFixed(4)) }));
  }, [logs]);

  const byPurpose = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs) m.set(l.purpose, (m.get(l.purpose) ?? 0) + Number(l.total_cost));
    return Array.from(m.entries()).map(([name, value]) => ({ name, value: Number(value.toFixed(4)) }));
  }, [logs]);

  const byModel = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs) m.set(l.model_name, (m.get(l.model_name) ?? 0) + Number(l.total_cost));
    return Array.from(m.entries()).map(([name, cost]) => ({ name, cost: Number(cost.toFixed(4)) }));
  }, [logs]);

  function exportCsv() {
    const rows = ["timestamp,model,purpose,input_tokens,output_tokens,total_cost"];
    for (const l of logs) rows.push(`${l.created_at},${l.model_name},${l.purpose},${l.input_tokens},${l.output_tokens},${l.total_cost}`);
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `jobforge-costs-${Date.now()}.csv`; link.click();
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Cost analytics</h1><p className="text-sm text-muted-foreground">Every AI call is priced and logged.</p></div>
        <Button variant="outline" size="sm" onClick={exportCsv}><Download className="mr-1 h-4 w-4" />Export CSV</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Kpi label="Today" value={`$${stats.today.toFixed(4)}`} />
        <Kpi label="This month" value={`$${stats.month.toFixed(4)}`} />
        <Kpi label="All time" value={`$${stats.total.toFixed(4)}`} />
        <Card>
          <CardHeader className="pb-2"><CardDescription>Monthly budget</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{budget ? `$${budget.toFixed(2)}` : "—"}</div>
            {budget && <Progress value={Math.min(100, (stats.month / budget) * 100)} className="mt-2" />}
            {budget && stats.month / budget > 0.8 && <div className="mt-1 text-xs text-amber-600">Approaching budget</div>}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Cost over time</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={byDay}><XAxis dataKey="date" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Line type="monotone" dataKey="cost" stroke="#00a698" /></LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>By purpose</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart><Tooltip /><Pie data={byPurpose} dataKey="value" nameKey="name" outerRadius={90} label>
                {byPurpose.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie></PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>By model</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byModel}><XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Bar dataKey="cost" fill="#00008c" /></BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle>Recent calls</CardTitle></CardHeader>
        <CardContent>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr><th className="py-1">When</th><th>Model</th><th>Purpose</th><th className="text-right">Tokens</th><th className="text-right">Cost</th></tr>
              </thead>
              <tbody>
                {logs.slice(0, 100).map((l: any) => (
                  <tr key={l.id} className="border-t"><td className="py-1 text-muted-foreground">{new Date(l.created_at).toLocaleString()}</td><td>{l.model_name}</td><td>{l.purpose}</td><td className="text-right">{l.total_tokens}</td><td className="text-right">${Number(l.total_cost).toFixed(4)}</td></tr>
                ))}
                {logs.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No AI calls yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardDescription>{label}</CardDescription></CardHeader>
      <CardContent><div className="text-2xl font-bold">{value}</div></CardContent>
    </Card>
  );
}
*** Add File: src/routes/_authenticated/settings.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { getMyWorkspace, updateBudget, listBoards, createBoard, renameBoard, deleteBoard } from "@/lib/workspace.functions";
import { getProvider, saveProvider, testConnection, listModels, upsertModel, deleteModel } from "@/lib/ai-config.functions";

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Plus } from "lucide-react";

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
  const { data: p } = useQuery({ queryKey: ["provider"], queryFn: () => get() });
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("deepseek-chat");

  useEffect(() => { if (p) setBaseUrl(p.base_url); }, [p]);

  const submit = useMutation({
    mutationFn: async () => {
      if (apiKey) await test({ data: { base_url: baseUrl, api_key: apiKey, model } } as any);
      await save({ data: { base_url: baseUrl, api_key: apiKey || "unchanged", name: "DeepSeek" } } as any);
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["provider"] }); setApiKey(""); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader><CardTitle>AI provider</CardTitle><CardDescription>Your key is encrypted at rest. Leave blank to keep current key.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <div><Label>Base URL</Label><Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} /></div>
        <div><Label>API key {p?.has_key ? <span className="text-xs text-muted-foreground">(saved)</span> : null}</Label>
          <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={p?.has_key ? "•••••••• (leave blank to keep)" : "sk-..."} />
        </div>
        <div><Label>Test model</Label><Input value={model} onChange={(e) => setModel(e.target.value)} /></div>
        <Button onClick={() => submit.mutate()} disabled={submit.isPending}>Save</Button>
      </CardContent>
    </Card>
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
                <ModelRow key={m.id} model={m} onSave={(d) => upsert({ data: d } as any).then(() => qc.invalidateQueries({ queryKey: ["models"] }))} onDelete={() => del({ data: { id: m.id } } as any).then(() => qc.invalidateQueries({ queryKey: ["models"] }))} />
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