import apiClient from "./client";

export interface AdminOverview {
  days: number;
  totals: {
    users: number;
    active_24h: number;
    active_7d: number;
    new_in_window: number;
    onboarded: number;
    jobs: number;
    ai_cost_this_month: number;
  };
  jobs_by_status: Record<string, number>;
  signups_by_day: { date: string; signups: number }[];
  ai_by_day: { date: string; calls: number; tokens: number; cost: number }[];
  ai_by_purpose: { purpose: string; calls: number; cost: number }[];
  top_spenders: { email: string; calls: number; cost: number }[];
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
  last_login_at: string | null;
  onboarding_complete: boolean;
  jobs: number;
  ai_cost_this_month: number;
  ai_cap_override: number | null;
  ai_cap_effective: number | null;
}

export interface AdminUsersPage {
  items: AdminUser[];
  total: number;
  page: number;
  page_size: number;
}

export type SignupMode = "open" | "invite" | "closed";

export interface AdminSettings {
  signup_mode: SignupMode;
  default_ai_monthly_cap_usd: number | null;
  notify_signups: boolean;
  notify_daily_summary: boolean;
  admin_emails: string[];
}

export type AdminSettingsUpdate = Partial<
  Pick<AdminSettings, "signup_mode" | "notify_signups" | "notify_daily_summary">
> & { default_ai_monthly_cap_usd?: number; clear_default_cap?: boolean };

export interface HealthCheck {
  name: string;
  ok: boolean;
  latency_ms: number;
  detail: string | null;
}

export interface AdminFailures {
  ai: { at: string; email: string | null; purpose: string; kind: string; message: string }[];
  latex: { at: string; email: string; artifact: string; message: string }[];
}

export interface AuditEntry {
  at: string;
  admin_email: string;
  action: string;
  target_email: string | null;
  detail: Record<string, unknown> | null;
}

const base = "/api/v1/admin";

export const adminApi = {
  overview: (days: number) => apiClient.get<AdminOverview>(`${base}/overview`, { params: { days } }).then((r) => r.data),

  users: (params: { search?: string; page: number; page_size?: number }) =>
    apiClient.get<AdminUsersPage>(`${base}/users`, { params }).then((r) => r.data),

  deleteUser: (id: string, confirmEmail: string) =>
    apiClient.delete(`${base}/users/${id}`, { data: { confirm_email: confirmEmail } }).then((r) => r.data),

  setAiCap: (id: string, capUsd: number | null) =>
    apiClient.put(`${base}/users/${id}/ai-cap`, { cap_usd: capUsd }).then((r) => r.data),

  settings: () => apiClient.get<AdminSettings>(`${base}/settings`).then((r) => r.data),

  updateSettings: (data: AdminSettingsUpdate) =>
    apiClient.put<AdminSettings>(`${base}/settings`, data).then((r) => r.data),

  allowlist: () =>
    apiClient.get<{ items: { email: string; created_at: string }[] }>(`${base}/allowlist`).then((r) => r.data),

  addToAllowlist: (email: string) => apiClient.post(`${base}/allowlist`, { email }).then((r) => r.data),

  removeFromAllowlist: (email: string) =>
    apiClient.delete(`${base}/allowlist/${encodeURIComponent(email)}`).then((r) => r.data),

  health: () => apiClient.get<{ ok: boolean; checks: HealthCheck[] }>(`${base}/health`).then((r) => r.data),

  failures: () => apiClient.get<AdminFailures>(`${base}/failures`).then((r) => r.data),

  audit: () => apiClient.get<{ items: AuditEntry[] }>(`${base}/audit`).then((r) => r.data),

  sendSummaryNow: () =>
    apiClient.post<{ ok: boolean; recipients: string[] }>(`${base}/summary/send`).then((r) => r.data),
};
