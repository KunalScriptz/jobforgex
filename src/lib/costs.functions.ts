import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getCostSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const ws = await supabase.from("workspaces").select("id, monthly_budget_usd").eq("owner_user_id", userId).maybeSingle();
    if (!ws.data) return null;
    const { data: logs } = await supabase
      .from("ai_cost_logs")
      .select("id, model_name, purpose, total_cost, total_tokens, input_tokens, output_tokens, created_at, job_id")
      .eq("workspace_id", ws.data.id)
      .order("created_at", { ascending: false })
      .limit(2000);
    return { budget: ws.data.monthly_budget_usd, logs: logs ?? [] };
  });