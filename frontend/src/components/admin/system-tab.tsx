import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, RefreshCw, XCircle } from "lucide-react";

import { adminApi } from "@/api/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";

export function SystemTab() {
  const health = useQuery({ queryKey: ["admin", "health"], queryFn: adminApi.health, refetchInterval: 60_000 });
  const failures = useQuery({ queryKey: ["admin", "failures"], queryFn: adminApi.failures });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Services</CardTitle>
            <CardDescription>Live checks against the real dependencies. Refreshes every minute.</CardDescription>
          </div>
          <Button size="sm" variant="outline" disabled={health.isFetching} onClick={() => health.refetch()}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${health.isFetching ? "animate-spin" : ""}`} />Recheck
          </Button>
        </CardHeader>
        <CardContent>
          {health.isError && <p className="text-sm text-destructive">Could not reach the health endpoint.</p>}
          {health.isLoading && <p className="text-sm text-muted-foreground">Checking…</p>}
          <ul className="grid gap-2 sm:grid-cols-2">
            {health.data?.checks.map((c) => (
              <li key={c.name} className={`flex items-start gap-3 rounded-md border p-3 ${c.ok ? "" : "border-destructive/40 bg-destructive/5"}`}>
                {c.ok
                  ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
                <div className="min-w-0 text-sm">
                  <div className="font-medium">{c.name} <span className="font-normal text-muted-foreground">{c.latency_ms} ms</span></div>
                  {c.detail && <div className="break-words text-xs text-muted-foreground">{c.detail}</div>}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent AI failures</CardTitle>
            <CardDescription>Error type only. Prompts and resume text are never stored here.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>User</TableHead><TableHead>Type</TableHead></TableRow></TableHeader>
              <TableBody>
                {failures.data?.ai.length === 0 && <TableRow><TableCell colSpan={3} className="text-muted-foreground">No failures recorded.</TableCell></TableRow>}
                {failures.data?.ai.map((f, i) => (
                  <TableRow key={i}>
                    <TableCell className="whitespace-nowrap text-xs">{formatDateTime(f.at)}</TableCell>
                    <TableCell className="text-sm">{f.email ?? "unknown"}</TableCell>
                    <TableCell className="text-sm">
                      <div className="font-medium">{f.kind.replace(/_/g, " ")}</div>
                      <div className="text-xs text-muted-foreground">{f.purpose.replace(/_/g, " ")}</div>
                      {f.message && <div className="max-w-xs truncate text-xs text-muted-foreground" title={f.message}>{f.message}</div>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent LaTeX compile failures</CardTitle>
            <CardDescription>First line of the compiler message only.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>User</TableHead><TableHead>Message</TableHead></TableRow></TableHeader>
              <TableBody>
                {failures.data?.latex.length === 0 && <TableRow><TableCell colSpan={3} className="text-muted-foreground">No failures recorded.</TableCell></TableRow>}
                {failures.data?.latex.map((f, i) => (
                  <TableRow key={i}>
                    <TableCell className="whitespace-nowrap text-xs">{formatDateTime(f.at)}</TableCell>
                    <TableCell className="text-sm">{f.email}</TableCell>
                    <TableCell className="text-sm">
                      <div className="text-xs text-muted-foreground">{f.artifact.replace(/_/g, " ")}</div>
                      <div className="max-w-xs truncate" title={f.message}>{f.message}</div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
