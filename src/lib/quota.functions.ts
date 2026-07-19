import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const FREE_PROMPT_LIMIT = 2;

/**
 * Atomically check-and-consume a prompt slot for the current user.
 * Free plan: hard cap of 2 total prompt submissions across every AI tool.
 * Paid (active or unexpired): unlimited.
 *
 * The user id is taken from the verified Supabase JWT — never from client input.
 */
export const checkPromptAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      tool_name: z.string().min(1).max(120),
      action: z.literal("prompt_submit").optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("try_consume_prompt", {
      _user_id: context.userId,
      _tool: data.tool_name,
    });
    if (error) throw new Error(error.message);
    const row: any = Array.isArray(rows) ? rows[0] : rows;
    return {
      allowed: !!row?.allowed,
      reason: (row?.reason as string) ?? "ok",
      remaining: row?.remaining ?? null,
      prompt_count: row?.prompt_count ?? 0,
      is_paid: !!row?.is_paid,
      limit: FREE_PROMPT_LIMIT,
    };
  });

/** Lightweight read of the current user's quota state (no increment). */
export const getPromptQuota = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("subscriptions")
      .select("plan, subscription_status, current_period_end, prompt_count")
      .eq("user_id", context.userId)
      .maybeSingle();
    const plan = data?.plan ?? "free";
    const status = data?.subscription_status ?? null;
    const end = data?.current_period_end ? new Date(data.current_period_end) : null;
    const isPaid =
      plan === "paid" && (status === "active" || (end != null && end.getTime() > Date.now()));
    const used = Number(data?.prompt_count ?? 0);
    return {
      is_paid: isPaid,
      prompt_count: used,
      limit: FREE_PROMPT_LIMIT,
      remaining: isPaid ? null : Math.max(FREE_PROMPT_LIMIT - used, 0),
    };
  });