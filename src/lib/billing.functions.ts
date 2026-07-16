import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getBillingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: ws } = await supabase
      .from("workspaces")
      .select("id, plan, currency, trial_apps_limit")
      .eq("owner_user_id", userId)
      .maybeSingle();
    if (!ws) {
      return {
        plan: "free" as const,
        currency: "USD" as const,
        trial_used: 0,
        trial_limit: 2,
        has_pro: false,
        current_period_end: null as string | null,
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isPro } = await supabaseAdmin.rpc("has_active_pro", { _ws: ws.id });

    const { data: arts } = await supabaseAdmin
      .from("job_artifacts")
      .select("job_id")
      .eq("workspace_id", ws.id)
      .in("kind", ["tailored_resume", "cover_letter"]);
    const distinctJobs = new Set(
      (arts ?? []).map((r: any) => r.job_id).filter((v: any): v is string => !!v),
    );

    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("current_period_end, cancel_at_period_end, cycle, status")
      .eq("workspace_id", ws.id)
      .in("status", ["active", "authenticated"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      plan: (ws.plan ?? "free") as "free" | "pro",
      currency: (ws.currency ?? "USD") as "INR" | "USD",
      trial_used: distinctJobs.size,
      trial_limit: Number(ws.trial_apps_limit ?? 2),
      has_pro: Boolean(isPro),
      current_period_end: sub?.current_period_end ?? null,
      cycle: sub?.cycle ?? null,
      cancel_at_period_end: Boolean(sub?.cancel_at_period_end),
    };
  });