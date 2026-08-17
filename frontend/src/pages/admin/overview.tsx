import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Users, UserCheck, UserX, PauseCircle, DollarSign, PieChart } from "lucide-react";

import { adminApi } from "@/api/admin";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { PageTitle } from "@/components/page-title";

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4.5 w-4.5 text-primary" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-bold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminOverviewPage() {
  const { data, isLoading } = useQuery({ queryKey: ["admin-overview"], queryFn: () => adminApi.getOverview() });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PageTitle title="Admin · Overview" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin overview</h1>
          <p className="text-sm text-muted-foreground">Subscriptions, revenue, and usage across all users.</p>
        </div>
        <Link to="/admin/subscriptions" className="text-sm text-primary hover:underline">
          View subscriptions →
        </Link>
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard icon={Users} label="Total users" value={data.total_users} />
            <StatCard icon={UserCheck} label="Active subscribers" value={data.active_subscribers} />
            <StatCard icon={UserX} label="Cancelled subscribers" value={data.cancelled_subscribers} />
            <StatCard icon={PauseCircle} label="Suspended" value={data.suspended_subscribers} />
            <StatCard icon={DollarSign} label="Est. MRR" value={`$${data.mrr_usd.toFixed(2)}`} />
            <StatCard icon={PieChart} label="Free users" value={data.free_users} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Plan distribution</CardTitle>
              <CardDescription>Subscribers grouped by plan.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.plan_distribution.map((p) => {
                const total = data.plan_distribution.reduce((s, x) => s + x.count, 0) || 1;
                const pct = Math.round((p.count / total) * 100);
                return (
                  <div key={p.plan_id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{p.plan_name}</span>
                      <span className="text-muted-foreground">{p.count} ({pct}%)</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
