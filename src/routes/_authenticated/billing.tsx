import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getBillingStatus } from "@/lib/billing.functions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Check, Mail } from "lucide-react";

export const Route = createFileRoute("/_authenticated/billing")({ component: BillingPage });

const PRICES = {
  INR: { starter: "₹199", monthly: "₹499", yearly: "₹4,999", symbol: "₹" },
  USD: { starter: "$2.99", monthly: "$6.99", yearly: "$59", symbol: "$" },
} as const;

function BillingPage() {
  const getStatus = useServerFn(getBillingStatus);
  const { data } = useQuery({ queryKey: ["billing"], queryFn: () => getStatus() });

  const currency = (data?.currency ?? "USD") as "INR" | "USD";
  const p = PRICES[currency];
  const used = data?.trial_used ?? 0;
  const limit = data?.trial_limit ?? 2;
  const isPro = Boolean(data?.has_pro);
  const trialPct = Math.min(100, (used / Math.max(1, limit)) * 100);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-sm text-muted-foreground">Manage your plan and trial usage.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Current plan
                <Badge variant={isPro ? "default" : "secondary"}>{isPro ? "Pro" : "Free trial"}</Badge>
              </CardTitle>
              <CardDescription>
                {isPro
                  ? data?.current_period_end
                    ? `Renews ${new Date(data.current_period_end).toLocaleDateString()}`
                    : "Active"
                  : "2 free applications, then upgrade to keep generating."}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        {!isPro && (
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Applications used</span>
              <span className="font-medium">{used} of {limit}</span>
            </div>
            <Progress value={trialPct} />
            <p className="text-xs text-muted-foreground">
              An "application" = the pair of tailored resume + cover letter for one job.
              Regenerating for the same job doesn't consume a new slot.
            </p>
          </CardContent>
        )}
      </Card>

      <Card className="border-primary/40 bg-gradient-to-br from-card to-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Pro plan
          </CardTitle>
          <CardDescription>Unlimited generations, priced in {currency}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <PlanBox
              title="Starter"
              price={p.starter}
              suffix="/mo"
              note="10 resumes + 10 cover letters"
            />
            <PlanBox title="Pro Monthly" price={p.monthly} suffix="/mo" note="Unlimited" highlight />
            <PlanBox title="Pro Yearly" price={p.yearly} suffix="/yr" note="Unlimited · ~2 months free" />
          </div>
          <ul className="space-y-1.5 text-sm">
            {[
              "Tailored resumes & cover letters",
              "AI chat edits on any document",
              "Job insights, ATS check & fit scoring",
              "Chrome extension for one-click job saves",
              "Priority support",
            ].map((f) => (
              <li key={f} className="flex items-center gap-2 text-muted-foreground">
                <Check className="h-4 w-4 text-primary" /> {f}
              </li>
            ))}
          </ul>

          <div className="rounded-md border border-dashed bg-background/50 p-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Mail className="h-3.5 w-3.5" /> Checkout coming soon
            </div>
            <p className="mt-1">
              Razorpay checkout is being finalized. To upgrade today, email{" "}
              <a
                className="underline"
                href={`mailto:support@jobforgex.com?subject=${encodeURIComponent("JobForge Pro upgrade request")}&body=${encodeURIComponent(
                  "Hi JobForge team,\n\nI'd like to upgrade to the following plan:\n\n• Plan: (Starter / Pro Monthly / Pro Yearly)\n• Currency: (INR / USD)\n• Workspace email: \n\nThanks!"
                )}`}
              >
                support@jobforgex.com
              </a>{" "}
              with your chosen plan and we'll enable it on your workspace within a few hours.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled>Starter {p.starter}/mo</Button>
            <Button disabled>Pro {p.monthly}/mo</Button>
            <Button variant="outline" disabled>Pro {p.yearly}/yr</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PlanBox({ title, price, suffix, note, highlight }: { title: string; price: string; suffix: string; note?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? "border-primary bg-primary/5" : ""}`}>
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-bold">{price}</span>
        <span className="text-sm text-muted-foreground">{suffix}</span>
      </div>
      {note && <div className="mt-0.5 text-xs text-primary">{note}</div>}
    </div>
  );
}