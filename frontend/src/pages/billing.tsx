import { useEffect, useState } from "react";
import { toast } from "sonner";
import { billingApi, BillingStatus, Pricing } from "@/api/billing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Check, Shield } from "lucide-react";

export default function BillingPage() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [pricing, setPricing] = useState<Pricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    Promise.all([billingApi.getStatus(), billingApi.getPricing()])
      .then(([s, p]) => {
        setStatus(s);
        setPricing(p);
      })
      .catch((err) => toast.error("Failed to load billing"))
      .finally(() => setLoading(false));
  }, []);

  const handleSubscribe = async (planId: string, cycle: string) => {
    setSubscribing(true);
    try {
      const data: any = await billingApi.createSubscription({
        plan_id: planId,
        billing_cycle: cycle,
        country_code: status?.currency || "DEFAULT",
      });
      if (data.short_url) {
        window.open(data.short_url, "_blank");
        toast.success("Redirecting to payment...");
      } else if (data.already_active) {
        toast.info("Subscription already active");
      } else {
        toast.success("Subscription created");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Subscription failed");
    } finally {
      setSubscribing(false);
    }
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center">Loading...</div>;
  }

  const currentPlan = status?.plan || "free";
  const defaultPricing = pricing.find((p) => p.country_code === "DEFAULT") || pricing[0];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Billing</h1>

      {status && (
        <Card>
          <CardHeader>
            <CardTitle>Current Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <Badge variant={status.has_pro ? "default" : "secondary"} className="text-sm">
                  {status.plan.toUpperCase()}
                </Badge>
                {status.current_period_end && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Next billing: {new Date(status.current_period_end).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                {status.trial_used} / {status.trial_limit} jobs used
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {["free", "pro", "unlimited"].map((planId) => {
          const planPricing = pricing.find((p) => p.plan_id === planId && p.country_code === (status?.currency || "DEFAULT"));
          const price = planPricing || defaultPricing;
          const isCurrent = currentPlan === planId;

          return (
            <Card key={planId} className={isCurrent ? "border-primary" : ""}>
              <CardHeader>
                <CardTitle className="capitalize">{planId}</CardTitle>
                {price && (
                  <CardDescription>
                    <span className="text-2xl font-bold text-foreground">
                      {price.currency_symbol}{price.monthly_price}
                    </span>
                    <span className="text-muted-foreground">/month</span>
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-1 text-sm">
                  {(planId === "free" && ["2 job tracks", "2 cover letters", "ATS checker", "Chrome extension"]) ||
                    (planId === "pro" && ["30 job tracks", "30 cover letters", "Structured builder", "ATS checker", "Priority support"]) ||
                    (["Unlimited job tracks", "Unlimited cover letters", "Structured builder", "ATS checker", "Priority support"])
                  }
                  {[...Array(5)].map((_, i) => (
                    <li key={i} className="flex items-center gap-1">
                      <Check className="h-3 w-3 text-green-500" />
                      {["2 job tracks", "2 cover letters", "ATS checker", "Chrome extension"][i] ||
                       ["30 job tracks", "30 cover letters", "Structured builder", "ATS checker", "Priority support"][i] ||
                       ["Unlimited tracks", "Unlimited letters", "Structured builder", "ATS checker", "Priority support"][i] ||
                       `Feature ${i + 1}`}
                    </li>
                  ))}
                </ul>
                {!isCurrent && planId !== "free" && (
                  <Button
                    className="w-full"
                    onClick={() => handleSubscribe(planId, "monthly")}
                    disabled={subscribing}
                  >
                    <CreditCard className="mr-1 h-4 w-4" />
                    {subscribing ? "..." : `Subscribe ${planId}`}
                  </Button>
                )}
                {isCurrent && (
                  <Button className="w-full" disabled>
                    Current Plan
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
