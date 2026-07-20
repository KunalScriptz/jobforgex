import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export class PlanNotConfiguredError extends Error {
  code = "PLAN_NOT_CONFIGURED" as const;
  constructor(message = "This plan isn't available in your region yet — try changing currency or contact support.") {
    super(message);
    this.name = "PlanNotConfiguredError";
  }
}

/**
 * Create a Razorpay subscription for the currently authenticated user.
 * Resolves the Razorpay plan id from geo_pricing based on the caller's
 * selected plan + billing cycle + country, with USD fallback.
 */
export const createSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    plan_id?: "pro" | "unlimited";
    billing_cycle?: "monthly" | "annual";
    country_code?: string;
    trial?: boolean;
  } | undefined) => ({
    plan_id: (input?.plan_id ?? "pro") as "pro" | "unlimited",
    billing_cycle: (input?.billing_cycle ?? "monthly") as "monthly" | "annual",
    country_code: (input?.country_code ?? "DEFAULT").toUpperCase(),
    trial: Boolean(input?.trial),
  }))
  .handler(async ({ context, data }) => {
    const keyId = (process.env.RAZORPAY_KEY_ID ?? "").trim();
    const keySecret = (process.env.RAZORPAY_KEY_SECRET ?? "").trim();
    if (!keyId || !keySecret) {
      throw new Error("Razorpay not configured: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set.");
    }

    const userId = context.userId;
    const email =
      (context.claims as any)?.email ??
      (context.claims as any)?.user_metadata?.email ??
      null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Resolve razorpay plan id from geo_pricing: try exact country, fall back to DEFAULT.
    const { data: rows } = await supabaseAdmin
      .from("geo_pricing")
      .select("country_code, razorpay_plan_id_monthly, razorpay_plan_id_annual")
      .eq("plan_id", data.plan_id)
      .in("country_code", [data.country_code, "DEFAULT"]);
    const chosen =
      (rows ?? []).find((r) => r.country_code === data.country_code) ??
      (rows ?? []).find((r) => r.country_code === "DEFAULT");
    const razorpayPlanId =
      data.billing_cycle === "annual"
        ? chosen?.razorpay_plan_id_annual
        : chosen?.razorpay_plan_id_monthly;
    if (!razorpayPlanId) {
      throw new PlanNotConfiguredError();
    }

    const { data: existing } = await supabaseAdmin
      .from("subscriptions")
      .select("razorpay_subscription_id, subscription_status, plan_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (
      existing?.razorpay_subscription_id &&
      existing.subscription_status === "active"
    ) {
      return {
        subscription_id: existing.razorpay_subscription_id,
        already_active: true,
        key_id: keyId,
        short_url: null,
        status: existing.subscription_status ?? null,
      };
    }

    const auth = btoa(`${keyId}:${keySecret}`);
    const useTrial = data.trial && data.plan_id === "pro" && data.billing_cycle === "annual";
    const res = await fetch("https://api.razorpay.com/v1/subscriptions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        plan_id: razorpayPlanId,
        total_count: data.billing_cycle === "annual" ? 10 : 120,
        customer_notify: 1,
        ...(useTrial ? { trial_period_days: 7 } : {}),
        notes: {
          supabase_user_id: userId,
          plan_id: data.plan_id,
          billing_cycle: data.billing_cycle,
          country_code: data.country_code,
          ...(email ? { email } : {}),
        },
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(
        `Razorpay create-subscription failed (${res.status}): ${text.slice(0, 500)}`,
      );
    }
    const json: any = JSON.parse(text);

    await supabaseAdmin
      .from("subscriptions")
      .upsert(
        {
          user_id: userId,
          razorpay_subscription_id: json.id,
          subscription_status: json.status ?? null,
          billing_cycle: data.billing_cycle,
        },
        { onConflict: "user_id" },
      );

    return {
      subscription_id: json.id as string,
      short_url: (json.short_url as string | undefined) ?? null,
      status: (json.status as string | undefined) ?? null,
      already_active: false,
      key_id: keyId,
    };
  });

/** Read the current user's subscription row (used by the debug page). */
export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    return data;
  });