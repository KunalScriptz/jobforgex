import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Create a Razorpay subscription for the currently authenticated user.
 * The user id is taken from the verified Supabase JWT — never from client input.
 * Returns the Razorpay subscription id (and short_url when present) so the
 * frontend can redirect the user to the hosted checkout.
 */
export const createSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const keyId = (process.env.RAZORPAY_KEY_ID ?? "").trim();
    const keySecret = (process.env.RAZORPAY_KEY_SECRET ?? "").trim();
    const planId = (process.env.RAZORPAY_PLAN_ID ?? "").trim();
    if (!keyId || !keySecret || !planId) {
      throw new Error(
        "Razorpay not configured: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and RAZORPAY_PLAN_ID must be set.",
      );
    }

    const userId = context.userId;
    const email =
      (context.claims as any)?.email ??
      (context.claims as any)?.user_metadata?.email ??
      null;

    // Look up any existing Razorpay ids we may already have stored for this user.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("subscriptions")
      .select("razorpay_subscription_id, subscription_status, plan")
      .eq("user_id", userId)
      .maybeSingle();

    if (
      existing?.razorpay_subscription_id &&
      (existing.subscription_status === "active" ||
        existing.plan === "paid")
    ) {
      return {
        subscription_id: existing.razorpay_subscription_id,
        already_active: true,
      };
    }

    const auth = btoa(`${keyId}:${keySecret}`);
    const res = await fetch("https://api.razorpay.com/v1/subscriptions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        plan_id: planId,
        total_count: 120, // 10 years of monthly cycles — subscription runs until cancelled
        customer_notify: 1,
        notes: {
          supabase_user_id: userId,
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

    // Pre-record the subscription id so we can correlate even if the webhook
    // arrives before the user returns to the app. Do NOT flip plan → paid yet.
    await supabaseAdmin
      .from("subscriptions")
      .upsert(
        {
          user_id: userId,
          razorpay_subscription_id: json.id,
          subscription_status: json.status ?? null,
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