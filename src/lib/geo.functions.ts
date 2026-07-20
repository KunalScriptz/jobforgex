import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { getRequestHeader } from "@tanstack/react-start/server";
import type { Database } from "@/integrations/supabase/types";

function publicSupabase() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

/** Detect the caller's country from edge headers. Returns ISO-2 or "DEFAULT". */
export const detectCountry = createServerFn({ method: "GET" }).handler(async () => {
  const cc =
    getRequestHeader("cf-ipcountry") ??
    getRequestHeader("x-vercel-ip-country") ??
    getRequestHeader("x-country-code") ??
    null;
  if (cc && /^[A-Z]{2}$/i.test(cc)) return { country_code: cc.toUpperCase() };
  return { country_code: "DEFAULT" };
});

export type PricedPlan = {
  plan_id: string;
  name: string;
  features: string[];
  job_track_limit: number | null;
  cover_letter_limit: number | null;
  currency: string;
  currency_symbol: string;
  monthly_price: number; // minor units
  annual_price: number;
  monthly_price_display: string;
  annual_price_display: string;
  razorpay_plan_id_monthly: string | null;
  razorpay_plan_id_annual: string | null;
  annual_discount_pct: number;
  sort_order: number;
};

function formatMinor(amount: number, currency: string, symbol: string) {
  const zeroDecimal = ["JPY", "KRW", "VND"].includes(currency);
  const value = zeroDecimal ? amount : amount / 100;
  const fmt = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: zeroDecimal ? 0 : 2,
    minimumFractionDigits: 0,
  }).format(value);
  return `${symbol}${fmt}`;
}

export const getPricing = createServerFn({ method: "GET" })
  .inputValidator((input: { country_code?: string } | undefined) => ({
    country_code: input?.country_code?.toUpperCase() ?? null,
  }))
  .handler(async ({ data }) => {
    const supabase = publicSupabase();
    const [{ data: plans }, { data: geo }] = await Promise.all([
      supabase.from("plans").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("geo_pricing").select("*"),
    ]);

    const results: PricedPlan[] = [];
    for (const plan of plans ?? []) {
      // Free plan has no geo row; synthesize
      if (plan.id === "free") {
        results.push({
          plan_id: plan.id,
          name: plan.name,
          features: Array.isArray(plan.features) ? (plan.features as string[]) : [],
          job_track_limit: plan.job_track_limit,
          cover_letter_limit: plan.cover_letter_limit,
          currency: "USD",
          currency_symbol: "$",
          monthly_price: 0,
          annual_price: 0,
          monthly_price_display: "$0",
          annual_price_display: "$0",
          razorpay_plan_id_monthly: null,
          razorpay_plan_id_annual: null,
          annual_discount_pct: 0,
          sort_order: plan.sort_order,
        });
        continue;
      }

      const rows = (geo ?? []).filter((g) => g.plan_id === plan.id);
      let row =
        (data.country_code && rows.find((r) => r.country_code === data.country_code)) ||
        rows.find((r) => r.country_code === "DEFAULT") ||
        rows[0];
      if (!row) continue;

      const monthlyPerYear = row.monthly_price * 12;
      const discountPct =
        monthlyPerYear > 0
          ? Math.round((1 - row.annual_price / monthlyPerYear) * 100)
          : 0;

      results.push({
        plan_id: plan.id,
        name: plan.name,
        features: Array.isArray(plan.features) ? (plan.features as string[]) : [],
        job_track_limit: plan.job_track_limit,
        cover_letter_limit: plan.cover_letter_limit,
        currency: row.currency,
        currency_symbol: row.currency_symbol,
        monthly_price: row.monthly_price,
        annual_price: row.annual_price,
        monthly_price_display: formatMinor(row.monthly_price, row.currency, row.currency_symbol),
        annual_price_display: formatMinor(row.annual_price, row.currency, row.currency_symbol),
        razorpay_plan_id_monthly: row.razorpay_plan_id_monthly,
        razorpay_plan_id_annual: row.razorpay_plan_id_annual,
        annual_discount_pct: discountPct,
        sort_order: plan.sort_order,
      });
    }

    return { country_code: data.country_code ?? "DEFAULT", plans: results };
  });