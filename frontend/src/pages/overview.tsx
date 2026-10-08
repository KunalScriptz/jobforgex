import { Link } from "react-router-dom";
import { useState } from "react";
import { CalendarCheck, Compass, Rocket, Target, TriangleAlert } from "lucide-react";

import { useOverview, useSetup } from "@/hooks/use-overview";
import { PageTitle } from "@/components/page-title";
import { PageHeader } from "@/components/shared/page-header";
import { FunnelBar } from "@/components/shared/funnel-bar";
import { EmptyState } from "@/components/shared/empty-state";
import { SourceBadge } from "@/components/shared/chips";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/format";

const WINDOWS = [7, 30, 90] as const;

const ATTENTION: Record<string, { text: (n: number, days?: number) => string; to: string }> = {
  follow_ups_due: { text: (n) => `${n} follow-up${n === 1 ? "" : "s"} due`, to: "/today" },
  stale_saved: { text: (n, d) => `${n} saved job${n === 1 ? "" : "s"} untouched for ${d ?? 7}+ days`, to: "/discovery" },
};

export default function OverviewPage() {
  const [days, setDays] = useState<number>(30);
  const { data, isLoading } = useOverview(days);
  const { data: setup } = useSetup();

  const best = data?.sources
    .filter((s) => s.applied >= 3 && s.reply_rate !== null)
    .sort((a, b) => (b.reply_rate ?? 0) - (a.reply_rate ?? 0))[0];

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageTitle title="Overview" />
      <PageHeader
        title="Overview"
        description="How your search is going, and what needs attention."
        actions={
          <ToggleGroup type="single" value={String(days)} onValueChange={(v) => v && setDays(Number(v))} variant="outline" size="sm">
            {WINDOWS.map((w) => <ToggleGroupItem key={w} value={String(w)}>{w} days</ToggleGroupItem>)}
          </ToggleGroup>
        }
      />

      {setup && setup.done < setup.total && (
        <Link to="/setup" className="mb-5 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm transition-colors hover:bg-primary/10">
          <Rocket className="h-4 w-4 text-primary" />
          <span className="flex-1"><b>Finish setting up</b> to get the most out of JobForge ({setup.done} of {setup.total} done).</span>
          <span className="text-xs text-muted-foreground">Open Setup quest →</span>
        </Link>
      )}

      {isLoading || !data ? (
        <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-40" /><Skeleton className="h-40" /><Skeleton className="h-64 md:col-span-2" /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium"><Target className="h-4 w-4 text-primary" />This week's target</div>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-semibold tabular-nums">{data.weekly.done}</span>
              <span className="pb-1 text-muted-foreground">of {data.weekly.target} applications</span>
            </div>
            <Progress value={Math.min(100, (data.weekly.done / Math.max(1, data.weekly.target)) * 100)} className="mt-3 h-2" />
            <p className={cn("mt-2 text-xs", data.weekly.on_track ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
              {data.weekly.done >= data.weekly.target
                ? "Target reached. Anything more is a bonus."
                : data.weekly.on_track
                  ? `On track, ${data.weekly.days_left} day${data.weekly.days_left === 1 ? "" : "s"} left this week.`
                  : `Behind pace: ${data.weekly.target - data.weekly.done} to go in ${data.weekly.days_left} day${data.weekly.days_left === 1 ? "" : "s"}.`}
            </p>
            <Link to="/settings" className="mt-3 inline-block text-xs text-muted-foreground underline-offset-2 hover:underline">Change target</Link>
          </section>

          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium"><TriangleAlert className="h-4 w-4 text-amber-500" />Needs attention</div>
            {data.attention.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing overdue. Nice.</p>
            ) : (
              <ul className="space-y-2">
                {data.attention.map((a) => {
                  const cfg = ATTENTION[a.key];
                  if (!cfg) return null;
                  return (
                    <li key={a.key}>
                      <Link to={cfg.to} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-accent/50">
                        {cfg.text(a.count, a.days)}<span className="text-xs text-muted-foreground">Open →</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-4 flex gap-2">
              <Button asChild size="sm" variant="outline"><Link to="/today"><CalendarCheck className="mr-1.5 h-4 w-4" />Today</Link></Button>
              <Button asChild size="sm" variant="outline"><Link to="/discovery"><Compass className="mr-1.5 h-4 w-4" />Discovery</Link></Button>
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5 shadow-sm md:col-span-2">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-sm font-medium">Funnel · last {data.window_days} days</h2>
              <span className="text-xs text-muted-foreground">Jobs that reached each stage in the window</span>
            </div>
            {data.funnel[0]?.count === 0 && data.funnel.every((s) => s.count === 0) ? (
              <EmptyState icon={Compass} title="Nothing in this window yet" description="Save jobs with the Chrome extension or add one manually, and the funnel fills in as you apply." />
            ) : (
              <FunnelBar stages={data.funnel} />
            )}
          </section>

          <section className="rounded-xl border bg-card p-5 shadow-sm md:col-span-2">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-sm font-medium">Reply rate by board · last {data.window_days} days</h2>
              {best && <span className="text-xs text-muted-foreground">Best so far: <b className="text-foreground">{formatPercent(best.reply_rate)}</b> on <SourceBadge source={best.source} /></span>}
            </div>
            {data.sources.length === 0 ? (
              <p className="text-sm text-muted-foreground">No jobs in this window yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Board</TableHead>
                      <TableHead className="text-right">Discovered</TableHead>
                      <TableHead className="text-right">Applied</TableHead>
                      <TableHead className="text-right">Replied</TableHead>
                      <TableHead className="text-right">Interviews</TableHead>
                      <TableHead className="text-right">Reply rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.sources.map((s) => (
                      <TableRow key={s.source}>
                        <TableCell><SourceBadge source={s.source} /></TableCell>
                        <TableCell className="text-right tabular-nums">{s.discovered}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.applied}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.replied}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.interviews}</TableCell>
                        <TableCell className={cn("text-right font-medium tabular-nums", best?.source === s.source && "text-emerald-600 dark:text-emerald-400")}>
                          {formatPercent(s.reply_rate)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="mt-2 text-xs text-muted-foreground">Reply rate = applications that heard back ÷ applications sent in the window.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
