import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/razorpay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = (process.env.RAZORPAY_WEBHOOK_SECRET ?? "").trim();
        if (!secret) {
          console.error("[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET not set");
          return new Response("Webhook secret not configured", { status: 500 });
        }

        const signature = request.headers.get("x-razorpay-signature") ?? "";
        const rawBody = await request.text();

        // HMAC SHA-256 over the RAW request body, hex-encoded.
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey(
          "raw",
          enc.encode(secret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"],
        );
        const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
        const expected = Array.from(new Uint8Array(sigBuf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        if (!timingSafeEqualHex(signature, expected)) {
          console.warn("[razorpay-webhook] invalid signature");
          return new Response("Invalid signature", { status: 400 });
        }

        let payload: any;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const event: string = payload?.event ?? "";
        const subEntity: any = payload?.payload?.subscription?.entity ?? null;
        const paymentEntity: any = payload?.payload?.payment?.entity ?? null;

        // We only care about subscription lifecycle events.
        const relevant = [
          "subscription.activated",
          "subscription.charged",
          "subscription.cancelled",
          "subscription.halted",
          "subscription.completed",
          "subscription.paused",
          "subscription.resumed",
          "subscription.pending",
        ];
        if (!relevant.includes(event) || !subEntity) {
          // Acknowledge — nothing to do, but don't make Razorpay retry.
          return new Response("ok", { status: 200 });
        }

        const razorpaySubId: string | null = subEntity.id ?? null;
        const razorpayCustomerId: string | null = subEntity.customer_id ?? null;
        const supabaseUserId: string | null =
          subEntity?.notes?.supabase_user_id ?? null;
        const currentEndUnix: number | null =
          subEntity.current_end ?? subEntity.charge_at ?? null;
        const currentPeriodEnd =
          currentEndUnix && Number.isFinite(currentEndUnix)
            ? new Date(currentEndUnix * 1000).toISOString()
            : null;

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        // Find the target subscription row: prefer razorpay_subscription_id,
        // fall back to notes.supabase_user_id set during create-subscription.
        let targetUserId: string | null = null;
        if (razorpaySubId) {
          const { data } = await supabaseAdmin
            .from("subscriptions")
            .select("user_id")
            .eq("razorpay_subscription_id", razorpaySubId)
            .maybeSingle();
          targetUserId = data?.user_id ?? null;
        }
        if (!targetUserId && supabaseUserId) {
          targetUserId = supabaseUserId;
        }
        if (!targetUserId) {
          console.warn(
            `[razorpay-webhook] ${event}: no matching user (sub=${razorpaySubId})`,
          );
          return new Response("ok", { status: 200 });
        }

        const update: Record<string, any> = {
          user_id: targetUserId,
          razorpay_subscription_id: razorpaySubId,
          razorpay_customer_id: razorpayCustomerId,
          updated_at: new Date().toISOString(),
        };

        switch (event) {
          case "subscription.activated":
          case "subscription.charged":
          case "subscription.resumed": {
            update.plan = "paid";
            update.subscription_status = "active";
            if (currentPeriodEnd) update.current_period_end = currentPeriodEnd;
            // charged event: sometimes payment.entity has captured_at → prefer subscription.current_end above.
            void paymentEntity;
            break;
          }
          case "subscription.cancelled": {
            update.subscription_status = "cancelled";
            // Do NOT downgrade plan here — grant access until current_period_end.
            break;
          }
          case "subscription.halted": {
            update.subscription_status = "halted";
            break;
          }
          case "subscription.completed": {
            update.subscription_status = "completed";
            break;
          }
          case "subscription.paused":
          case "subscription.pending": {
            update.subscription_status = "past_due";
            break;
          }
        }

        const { error } = await supabaseAdmin
          .from("subscriptions")
          .upsert(update, { onConflict: "user_id" });
        if (error) {
          console.error(`[razorpay-webhook] db upsert failed: ${error.message}`);
          // Still return 200 so Razorpay doesn't hammer retries;
          // we've logged for investigation.
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}