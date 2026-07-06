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
