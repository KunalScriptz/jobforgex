import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { adminApi } from "@/api/admin";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageTitle } from "@/components/page-title";

export default function AdminSubscriptionsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-subscriptions"],
    queryFn: () => adminApi.listSubscriptions(100, 0),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageTitle title="Admin · Subscriptions" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Subscriptions</h1>
          <p className="text-sm text-muted-foreground">All users and their current plan/status.</p>
        </div>
        <Link to="/admin" className="text-sm text-primary hover:underline">
          ← Overview
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All subscriptions</CardTitle>
          <CardDescription>{data ? `${data.length} shown` : "Loading…"}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading || !data ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cycle</TableHead>
                  <TableHead>Renews / ends</TableHead>
                  <TableHead>Flags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="font-medium">{s.full_name || s.email}</div>
                      <div className="text-xs text-muted-foreground">{s.email}</div>
                    </TableCell>
                    <TableCell className="capitalize">{s.plan}</TableCell>
                    <TableCell className="capitalize">{s.subscription_status ?? "—"}</TableCell>
                    <TableCell className="capitalize">{s.billing_cycle ?? "—"}</TableCell>
                    <TableCell>
                      {s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="space-x-1">
                      {s.cancel_at_period_end && <Badge variant="outline">Cancelling</Badge>}
                      {s.suspended && <Badge variant="destructive">Suspended</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
