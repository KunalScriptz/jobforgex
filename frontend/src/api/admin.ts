import apiClient from "./client";

export interface PlanDistribution {
  plan_id: string;
  plan_name: string;
  count: number;
}

export interface AdminOverview {
  total_users: number;
  active_subscribers: number;
  cancelled_subscribers: number;
  suspended_subscribers: number;
  free_users: number;
  plan_distribution: PlanDistribution[];
  mrr_usd: number;
}

export interface RevenuePoint {
  date: string;
  amount_usd: number;
  event_count: number;
}

export interface AdminSubscription {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  plan: string;
  subscription_status: string | null;
  billing_cycle: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  suspended: boolean;
  created_at: string;
}

export interface AdminUsageRow {
  user_id: string;
  email: string;
  plan: string;
  job_tracks_used: number;
  cover_letters_used: number;
  period_start: string;
}

export const adminApi = {
  getOverview: () => apiClient.get<AdminOverview>("/api/v1/admin/stats/overview").then((r) => r.data),

  getRevenue: (days = 30) =>
    apiClient.get<RevenuePoint[]>("/api/v1/admin/stats/revenue", { params: { days } }).then((r) => r.data),

  listSubscriptions: (limit = 50, offset = 0) =>
    apiClient
      .get<AdminSubscription[]>("/api/v1/admin/subscriptions", { params: { limit, offset } })
      .then((r) => r.data),

  listUsage: (limit = 50) =>
    apiClient.get<AdminUsageRow[]>("/api/v1/admin/usage", { params: { limit } }).then((r) => r.data),
};
