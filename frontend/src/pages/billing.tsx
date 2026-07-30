import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { billingApi } from "@/api/billing";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Check, Loader2 } from "lucide-react";

const COUNTRY_OPTIONS: Array<{ code: string; label: string }> = [
  { code: "DEFAULT", label: "United States (USD)" },
  { code: "IN", label: "India (INR)" },
];

type PricedPlan = {
  plan_id: string;
  name: string;
  currency: string;
  currency_symbol: string;
  monthly_price_display: string;
  annual_price_display: string;
  annual_price: number;
  annual_discount_pct: number;
  razorpay_plan_id_monthly: string | null;
  razorpay_plan_id_annual: string | null;
  features: string[];
};

export default function BillingPage() {
  const { data } = useQuery({ queryKey: ["billing"], queryFn: () => billingApi.getStatus() });

  const [pollEnabled, setPollEnabled] = useState(false);
  const { data: sub, refetch: refetchSub } = useQuery({
    queryKey: ["my-subscription"],
    queryFn: () => billingApi.getSubscription(),
    refetchInterval: pollEnabled ? 2500 : false,
  });

  const [country, setCountry] = useState<string>(() => {
    if (typeof window === "undefined") return "DEFAULT";
    return window.localStorage.getItem("preferred_country") ?? "DEFAULT";
  });
  const [cycle, setCycle] = useState<"monthly" | "annual">("annual");

  useEffect(() => {
    if (typeof window !== "undefined" && country) {
      window.localStorage.setItem("preferred_country", country);
    }
  }, [country]);

  const { data: pricing } = useQuery({
    queryKey: ["pricing", country],
    queryFn: () => billingApi.getPricing(country),
  });

  const plans: PricedPlan[] = (pricing ?? []).map((p: any) => ({
    ...p,
    features: p.features ?? [],
    razorpay_plan_id_monthly: p.razorpay_plan_id_monthly ?? null,
    razorpay_plan_id_annual: p.razorpay_plan_id_annual ?? null,
    monthly_price_display: p.monthly_price_display ?? `${p.currency_symbol}${((p.monthly_price ?? 0) / 100).toFixed(p.currency === "INR" ? 0 : 2)}`,
    annual_price_display: p.annual_price_display ?? `${p.currency_symbol}${((p.annual_price ?? 0) / 100).toFixed(p.currency === "INR" ? 0 : 2)}`,
    annual_discount_pct: p.annual_discount_pct ?? 0,
    name: p.name ?? (p.plan_id === "free" ? "Free" : p.plan_id === "pro" ? "Pro" : p.plan_id),
  }));
  const proPlan = plans.find((p) => p.plan_id === "pro");

  const used = data?.trial_used ?? 0;
  const limit = data?.trial_limit ?? 2;
  const subPlanId = ((sub as any)?.plan_id as string | undefined) ?? "free";
  const subStatus = (sub?.subscription_status as string | undefined) ?? null;
  const subEnd = sub?.current_period_end ? new Date(sub.current_period_end as string) : null;
  const isPaidActive =
    subPlanId !== "free" &&
    (subStatus === "active" || (subEnd != null && subEnd.getTime() > Date.now()));
  const isPro = Boolean(data?.has_pro) || isPaidActive;
  const trialPct = Math.min(100, (used / Math.max(1, limit)) * 100);

  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
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

  async function handleUpgrade(plan: PricedPlan, opts?: { trial?: boolean }) {
    const key = `${plan.plan_id}:${cycle}`;
    try {
      setCheckoutLoading(key);
      const ok = await loadRazorpay();
      if (!ok) throw new Error("Failed to load Razorpay");
      const resp: any = await billingApi.createSubscription({
        plan_id: plan.plan_id as "pro" | "unlimited",
        billing_cycle: cycle,
        country_code: country,
        trial: Boolean(opts?.trial),
      });
      if (resp.already_active) {
        toast.info("You already have an active subscription");
        await refetchSub();
        return;
      }
      const rzp = new (window as any).Razorpay({
        key: resp.key_id,
        subscription_id: resp.subscription_id,
        name: `JobForge ${plan.name}`,
        description: `${plan.name} · ${cycle === "annual" ? "Annual" : "Monthly"}`,
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
          ondismiss: () => setCheckoutLoading(null),
        },
        theme: { color: "#6366f1" },
      });
      rzp.on("payment.failed", () => {
        toast.error("Payment failed. Please try again.");
        setCheckoutLoading(null);
      });
      rzp.open();
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("PLAN_NOT_CONFIGURED") || /isn't available in your region/i.test(msg)) {
        toast.error("This plan isn't available in your region yet — try changing currency or contact support.");
      } else {
        toast.error(msg.slice(0, 300));
      }
      setCheckoutLoading(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Billing</h1>
          <p className="text-sm text-muted-foreground">Manage your plan and trial usage.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Country</label>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            {COUNTRY_OPTIONS.map((o) => (
              <option key={o.code} value={o.code}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Current plan
                <Badge variant={isPro ? "default" : "secondary"}>
                  {isPro ? (proPlan?.name ?? "Pro") : "Free trial"}
                </Badge>
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

      {/* Billing cycle toggle */}
      <div className="flex items-center justify-center gap-1 rounded-full border bg-muted/30 p-1 w-fit mx-auto">
        <button
          onClick={() => setCycle("monthly")}
          className={`rounded-full px-4 py-1.5 text-sm ${cycle === "monthly" ? "bg-background shadow" : "text-muted-foreground"}`}
        >
          Monthly
        </button>
        <button
          onClick={() => setCycle("annual")}
          className={`rounded-full px-4 py-1.5 text-sm ${cycle === "annual" ? "bg-background shadow" : "text-muted-foreground"}`}
        >
          Annual
          {proPlan && proPlan.annual_discount_pct >= 15 && (
            <span className="ml-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              Save {proPlan.annual_discount_pct}%
            </span>
          )}
        </button>
      </div>

      {/* Plan cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard
            key={plan.plan_id}
            plan={plan}
            cycle={cycle}
            isCurrent={
              plan.plan_id === "free" ? !isPaidActive : subPlanId === plan.plan_id && isPaidActive
            }
            loading={checkoutLoading === `${plan.plan_id}:${cycle}`}
            activating={activating}
            onUpgrade={handleUpgrade}
            renewLabel={
              subPlanId === plan.plan_id && isPaidActive && subEnd
                ? `Renews ${subEnd.toLocaleDateString()}`
                : undefined
            }
          />
        ))}
      </div>
      {activationHint && (
        <p className="text-center text-xs text-muted-foreground">{activationHint}</p>
      )}
    </div>
  );
}

function PlanCard({
  plan,
  cycle,
  isCurrent,
  loading,
  activating,
  onUpgrade,
  renewLabel,
}: {
  plan: PricedPlan;
  cycle: "monthly" | "annual";
  isCurrent: boolean;
  loading: boolean;
  activating: boolean;
  onUpgrade: (p: PricedPlan, opts?: { trial?: boolean }) => void;
  renewLabel?: string;
}) {
  const isFree = plan.plan_id === "free";
  const isPro = plan.plan_id === "pro";
  const highlight = isPro;
  const priceMain =
    cycle === "annual"
      ? `${plan.currency_symbol}${(plan.annual_price / 100 / 12).toFixed(plan.currency === "INR" ? 0 : 2)}`
      : plan.monthly_price_display;
  const priceSuffix = cycle === "annual" ? "/mo billed annually" : "/mo";
  const yearNote =
    cycle === "annual" && !isFree
      ? `${plan.annual_price_display}/yr`
      : null;
  const hasPlanId =
    isFree ||
    (cycle === "annual" ? plan.razorpay_plan_id_annual : plan.razorpay_plan_id_monthly);

  return (
    <Card className={highlight ? "border-primary bg-primary/5" : ""}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {plan.name}
            {isPro && <Sparkles className="h-4 w-4 text-primary" />}
          </CardTitle>
          {isCurrent && <Badge>Current</Badge>}
        </div>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-3xl font-bold">{isFree ? `${plan.currency_symbol}0` : priceMain}</span>
          <span className="text-sm text-muted-foreground">{isFree ? "/forever" : priceSuffix}</span>
        </div>
        {yearNote && (
          <CardDescription className="mt-1">{yearNote}</CardDescription>
        )}
        {renewLabel && (
          <CardDescription className="mt-1">{renewLabel}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1.5 text-sm">
          {plan.features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-muted-foreground">
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
        {isFree ? (
          <Button variant="outline" className="w-full" disabled>
            {isCurrent ? "Current plan" : "Included"}
          </Button>
        ) : isCurrent ? (
          <Button className="w-full" disabled>Current plan</Button>
        ) : !hasPlanId ? (
          <Button variant="outline" className="w-full" disabled>
            Coming soon in your region
          </Button>
        ) : (
          <div className="space-y-2">
            <Button
              className="w-full"
              variant={highlight ? "default" : "outline"}
              onClick={() => onUpgrade(plan)}
              disabled={loading || activating}
            >
              {loading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opening checkout…</>
              ) : activating ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Activating…</>
              ) : (
                `Upgrade to ${plan.name}`
              )}
            </Button>
            {isPro && cycle === "annual" && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => onUpgrade(plan, { trial: true })}
                disabled={loading || activating}
              >
                Start 7-day free trial
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
