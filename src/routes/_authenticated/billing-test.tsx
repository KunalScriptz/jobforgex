import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { createSubscription, getMySubscription } from "@/lib/razorpay.functions";

export const Route = createFileRoute("/_authenticated/billing-test")({
  component: BillingTestPage,
});

function BillingTestPage() {
  const qc = useQueryClient();
  const getSubFn = useServerFn(getMySubscription);
  const createSubFn = useServerFn(createSubscription);

  const { data: sub, isLoading, refetch } = useQuery({
    queryKey: ["my-subscription"],
    queryFn: () => getSubFn(),
    refetchInterval: 5000, // poll so we see webhook updates without reload
  });

  const [lastResp, setLastResp] = useState<any>(null);

  const createSub = useMutation({
    mutationFn: () => createSubFn(),
    onSuccess: (data) => {
      setLastResp(data);
      qc.invalidateQueries({ queryKey: ["my-subscription"] });
      toast.success(`Subscription created: ${data.subscription_id}`);
    },
    onError: (e: any) => toast.error(String(e?.message ?? e).slice(0, 300)),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">Billing test (Phase 1 debug)</h1>
        <p className="text-sm text-muted-foreground">
          Temporary page for verifying Razorpay subscription flow. Poll every 5s.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Create a subscription</CardTitle>
          <CardDescription>
            Calls the <code>createSubscription</code> server fn as the currently
            signed-in user. Uses <code>RAZORPAY_PLAN_ID</code> from env.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={() => createSub.mutate()} disabled={createSub.isPending}>
            {createSub.isPending ? "Creating…" : "Create subscription"}
          </Button>
          {lastResp?.short_url && (
            <div className="text-sm">
              Open Razorpay checkout:{" "}
              <a
                href={lastResp.short_url}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                {lastResp.short_url}
              </a>
            </div>
          )}
          {lastResp && (
            <pre className="overflow-auto rounded bg-muted p-3 text-xs">
              {JSON.stringify(lastResp, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Current subscriptions row</CardTitle>
          <CardDescription>
            Live view of <code>public.subscriptions</code> for your user.
            Auto-refreshes every 5 seconds — after the webhook fires, this should
            flip to plan=paid, subscription_status=active, with current_period_end.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : sub ? (
            <pre className="overflow-auto rounded bg-muted p-3 text-xs">
              {JSON.stringify(sub, null, 2)}
            </pre>
          ) : (
            <div className="text-sm text-muted-foreground">
              No subscriptions row yet. Sign out + back in, or wait for the
              signup trigger.
            </div>
          )}
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Refresh now
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Webhook URL</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Configure this URL in the Razorpay Dashboard → Webhooks:</p>
          <code className="block break-all rounded bg-muted p-2 text-xs">
            {typeof window !== "undefined"
              ? `${window.location.origin}/api/public/razorpay-webhook`
              : "/api/public/razorpay-webhook"}
          </code>
          <p className="text-muted-foreground">
            Subscribe to events: <code>subscription.activated</code>,{" "}
            <code>subscription.charged</code>,{" "}
            <code>subscription.cancelled</code>, <code>subscription.halted</code>,{" "}
            <code>subscription.completed</code>. Use the same secret you save as
            <code> RAZORPAY_WEBHOOK_SECRET</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}