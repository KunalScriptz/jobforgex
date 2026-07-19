import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { getBillingStatus } from "@/lib/billing.functions";
import { createSubscription, getMySubscription } from "@/lib/razorpay.functions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Check, Mail, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/billing")({ component: BillingPage });

const PRICES = {
  INR: { starter: "₹199", monthly: "₹499", yearly: "₹4,999", symbol: "₹" },
  USD: { starter: "$2.99", monthly: "$6.99", yearly: "$59", symbol: "$" },
} as const;

function BillingPage() {
  const getStatus = useServerFn(getBillingStatus);
  const { data } = useQuery({ queryKey: ["billing"], queryFn: () => getStatus() });

  const getSubFn = useServerFn(getMySubscription);
  const createSubFn = useServerFn(createSubscription);
  const [pollEnabled, setPollEnabled] = useState(false);
  const { data: sub, refetch: refetchSub } = useQuery({
    queryKey: ["my-subscription"],
    queryFn: () => getSubFn(),
    refetchInterval: pollEnabled ? 2500 : false,
  });

  const currency = (data?.currency ?? "USD") as "INR" | "USD";
  const p = PRICES[currency];
  const used = data?.trial_used ?? 0;
  const limit = data?.trial_limit ?? 2;
  const subPlan = (sub?.plan as string | undefined) ?? "free";
  const subStatus = (sub?.subscription_status as string | undefined) ?? null;
  const subEnd = sub?.current_period_end ? new Date(sub.current_period_end as string) : null;
  const isPaidActive =
    subPlan === "paid" &&
    (subStatus === "active" || (subEnd != null && subEnd.getTime() > Date.now()));
  const isPro = Boolean(data?.has_pro) || isPaidActive;
  const trialPct = Math.min(100, (used / Math.max(1, limit)) * 100);

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activationHint, setActivationHint] = useState<string | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (activating && isPaidActive) {
      setActivating(false);
      setPollEnabled(false);
      setActivationHint(null);
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
      toast.success("Subscription activated");
    }
  }, [activating, isPaidActive]);

  useEffect(() => () => {
    if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
  }, []);

  async function loadRazorpay(): Promise<boolean> {
    if (typeof window === "undefined") return false;
    if ((window as any).Razorpay) return true;
    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.body.appendChild(s);
    });
  }

  async function handleUpgrade() {
    try {
      setCheckoutLoading(true);
      const ok = await loadRazorpay();
      if (!ok) throw new Error("Failed to load Razorpay");
      const resp = await createSubFn();
      if ((resp as any).already_active) {
        toast.info("You already have an active subscription");
        await refetchSub();
        return;
      }
      const rzp = new (window as any).Razorpay({
        key: (resp as any).key_id,
        subscription_id: (resp as any).subscription_id,
        name: "JobForge Pro",
        description: "Pro subscription",
        handler: () => {
          setActivating(true);
          setActivationHint("Activating your subscription…");
          setPollEnabled(true);
          if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
          pollTimerRef.current = window.setTimeout(() => {
            setPollEnabled(false);
            setActivationHint(
              "Payment received, activating your account — this may take a minute. Refresh shortly.",
            );
          }, 20000);
        },
        modal: {
          ondismiss: () => setCheckoutLoading(false),
        },
        theme: { color: "#6366f1" },
      });
      rzp.on("payment.failed", () => {
        toast.error("Payment failed. Please try again.");
        setCheckoutLoading(false);
      });
      rzp.open();
    } catch (e: any) {
      toast.error(String(e?.message ?? e).slice(0, 300));
      setCheckoutLoading(false);
    }
  }

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

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className={subPlan === "free" && !isPaidActive ? "border-primary/50" : ""}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Free</CardTitle>
              {subPlan === "free" && !isPaidActive && <Badge variant="secondary">Current Plan</Badge>}
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-3xl font-bold">$0</span>
              <span className="text-sm text-muted-foreground">/forever</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-1.5 text-sm">
              {[
                "2 prompt submissions",
                "Access to all AI tools",
                "Chrome extension for job saves",
                "Community support",
              ].map((f) => (
                <li key={f} className="flex items-center gap-2 text-muted-foreground">
                  <Check className="h-4 w-4 text-primary" /> {f}
                </li>
              ))}
            </ul>
            <Button variant="outline" className="w-full" disabled>
              {subPlan === "free" && !isPaidActive ? "Current Plan" : "Included"}
            </Button>
          </CardContent>
        </Card>

        <Card className={isPaidActive ? "border-primary/50" : "border-primary bg-primary/5"}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                Pro <Sparkles className="h-4 w-4 text-primary" />
              </CardTitle>
              {isPaidActive && <Badge>Current Plan</Badge>}
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-3xl font-bold">$100</span>
              <span className="text-sm text-muted-foreground">/month</span>
            </div>
            {isPaidActive && subEnd && (
              <CardDescription className="mt-1">
                Renews {subEnd.toLocaleDateString()}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-1.5 text-sm">
              {[
                "Unlimited prompt submissions",
                "Access to all AI tools",
                "Job insights, ATS check & scoring",
                "Priority support",
              ].map((f) => (
                <li key={f} className="flex items-center gap-2 text-muted-foreground">
                  <Check className="h-4 w-4 text-primary" /> {f}
                </li>
              ))}
            </ul>
            {isPaidActive ? (
              <Button className="w-full" disabled>Current Plan</Button>
            ) : (
              <Button
                className="w-full"
                onClick={handleUpgrade}
                disabled={checkoutLoading || activating}
              >
                {activating ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Activating…</>
                ) : checkoutLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opening checkout…</>
                ) : (
                  "Upgrade"
                )}
              </Button>
            )}
            {activationHint && (
              <p className="text-xs text-muted-foreground">{activationHint}</p>
            )}
          </CardContent>
        </Card>
      </div>
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