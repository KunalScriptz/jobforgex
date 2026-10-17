import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { adminApi } from "@/api/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";

const signupsConfig = { signups: { label: "Signups", color: "var(--chart-2)" } } satisfies ChartConfig;
const costConfig = { cost: { label: "AI cost ($)", color: "var(--chart-1)" } } satisfies ChartConfig;

const usd = (v: number) => `$${v.toFixed(2)}`;

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export function OverviewTab() {
  const [days, setDays] = useState(30);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "overview", days],
    queryFn: () => adminApi.overview(days),
  });

  if (isError) return <p className="text-sm text-destructive">Could not load the overview.</p>;
  if (isLoading || !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  const { totals } = data;
  const tick = (d: string) => formatDate(d).replace(/,? \d{4}$/, "");
  const statuses = Object.entries(data.jobs_by_status).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Counts and totals only. Job and resume content is never shown here.</p>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Users" value={totals.users} hint={`${totals.new_in_window} new in ${days} days`} />
        <Stat label="Active (24h / 7d)" value={`${totals.active_24h} / ${totals.active_7d}`} hint="by last sign-in or token refresh" />
        <Stat label="Onboarded" value={totals.onboarded} hint={`of ${totals.users} users`} />
        <Stat label="AI spend this month" value={usd(totals.ai_cost_this_month)} hint={`${totals.jobs} jobs tracked`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Signups per day</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={signupsConfig} className="h-48 w-full">
              <BarChart data={data.signups_by_day}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickFormatter={tick} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} width={28} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent labelFormatter={(d) => formatDate(String(d))} />} />
                <Bar dataKey="signups" fill="var(--color-signups)" radius={3} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">AI cost per day</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={costConfig} className="h-48 w-full">
              <BarChart data={data.ai_by_day}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickFormatter={tick} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis width={40} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                <ChartTooltip content={<ChartTooltipContent labelFormatter={(d) => formatDate(String(d))} />} />
                <Bar dataKey="cost" fill="var(--color-cost)" radius={3} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Jobs by status</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {statuses.length === 0 && <p className="text-muted-foreground">No jobs yet.</p>}
            {statuses.map(([status, n]) => (
              <div key={status} className="flex justify-between">
                <span className="capitalize">{status === "wishlist" ? "saved" : status}</span>
                <span className="tabular-nums text-muted-foreground">{n}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">AI cost by purpose</CardTitle><CardDescription>Last {days} days</CardDescription></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {data.ai_by_purpose.length === 0 && <p className="text-muted-foreground">No AI calls yet.</p>}
            {data.ai_by_purpose.map((p) => (
              <div key={p.purpose} className="flex justify-between">
                <span>{p.purpose.replace(/_/g, " ")} <span className="text-muted-foreground">({p.calls})</span></span>
                <span className="tabular-nums text-muted-foreground">{usd(p.cost)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Top AI spenders</CardTitle><CardDescription>This month</CardDescription></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {data.top_spenders.length === 0 && <p className="text-muted-foreground">No AI spend yet.</p>}
            {data.top_spenders.map((s) => (
              <div key={s.email} className="flex justify-between gap-2">
                <span className="truncate">{s.email}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{usd(s.cost)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
