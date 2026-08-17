import apiClient from "./client";

export interface BillingStatus {
  plan: string;
  currency: string;
  trial_used: number;
  trial_limit: number;
  has_pro: boolean;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan: string;
  subscription_status: string | null;
  razorpay_subscription_id: string | null;
  billing_cycle: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_ends_at: string | null;
  suspended: boolean;
  last_payment_status: string | null;
  last_payment_at: string | null;
  paused_at: string | null;
  cancelled_at: string | null;
}

export interface Pricing {
  plan_id: string;
  country_code: string;
  currency: string;
  currency_symbol: string;
  monthly_price: number;
  annual_price: number;
}

export interface UsageMetric {
  used: number;
  limit: number | null;
  remaining: number | null;
  unlimited: boolean;
}

export interface Usage {
  plan: string;
  period_start: string;
  period_end: string;
  job_tracks: UsageMetric;
  cover_letters: UsageMetric;
}

export interface BillingHistoryItem {
  id: string;
  event_type: string;
  created_at: string;
  summary: string;
}

export const billingApi = {
  getStatus: () =>
    apiClient.get<BillingStatus>("/api/v1/billing/status").then((r) => r.data),

  getUsage: () =>
    apiClient.get<Usage>("/api/v1/billing/usage").then((r) => r.data),

  createSubscription: (data: {
    plan_id?: string;
    billing_cycle?: string;
    country_code?: string;
    trial?: boolean;
  }) => apiClient.post("/api/v1/billing/subscription/create", data).then((r) => r.data),

  cancelSubscription: (atPeriodEnd: boolean = true) =>
    apiClient
      .post<Subscription>("/api/v1/billing/subscription/cancel", { at_period_end: atPeriodEnd })
      .then((r) => r.data),

  reactivateSubscription: () =>
    apiClient.post<Subscription>("/api/v1/billing/subscription/reactivate").then((r) => r.data),

  getSubscription: () =>
    apiClient.get<Subscription | null>("/api/v1/billing/subscription").then((r) => r.data),

  getBillingHistory: () =>
    apiClient.get<BillingHistoryItem[]>("/api/v1/billing/subscription/history").then((r) => r.data),

  getPricing: (countryCode?: string) =>
    apiClient
      .get<Pricing[]>("/api/v1/billing/pricing", { params: { country_code: countryCode || "DEFAULT" } })
      .then((r) => r.data),
};
