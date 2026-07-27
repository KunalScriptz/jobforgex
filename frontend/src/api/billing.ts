import apiClient from "./client";

export interface BillingStatus {
  plan: string;
  currency: string;
  trial_used: number;
  trial_limit: number;
  has_pro: boolean;
  current_period_end: string | null;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan: string;
  subscription_status: string | null;
  razorpay_subscription_id: string | null;
  billing_cycle: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  suspended: boolean;
}

export interface Pricing {
  plan_id: string;
  country_code: string;
  currency: string;
  currency_symbol: string;
  monthly_price: number;
  annual_price: number;
}

export const billingApi = {
  getStatus: () =>
    apiClient.get<BillingStatus>("/api/v1/billing/status").then((r) => r.data),

  createSubscription: (data: {
    plan_id?: string;
    billing_cycle?: string;
    country_code?: string;
    trial?: boolean;
  }) => apiClient.post("/api/v1/billing/subscription/create", data).then((r) => r.data),

  getSubscription: () =>
    apiClient.get<Subscription | null>("/api/v1/billing/subscription").then((r) => r.data),

  getPricing: (countryCode?: string) =>
    apiClient
      .get<Pricing[]>("/api/v1/billing/pricing", { params: { country_code: countryCode || "DEFAULT" } })
      .then((r) => r.data),
};
