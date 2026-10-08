import apiClient from "./client";

export interface FunnelStage { key: string; label: string; count: number }
export interface SourceRow {
  source: string;
  discovered: number;
  applied: number;
  replied: number;
  interviews: number;
  reply_rate: number | null;
}
export interface Weekly { target: number; done: number; days_left: number; on_track: boolean; week_start: string }
export interface AttentionItem { key: "follow_ups_due" | "stale_saved" | string; count: number; days?: number }

export interface OverviewSummary {
  window_days: number;
  funnel: FunnelStage[];
  weekly: Weekly;
  attention: AttentionItem[];
  sources: SourceRow[];
}

export interface TodayData {
  date: string;
  applied_today: number;
  weekly: Weekly;
  follow_ups: import("./jobs").JobCard[];
  ready_to_apply: import("./jobs").JobCard[];
  to_tailor: import("./jobs").JobCard[];
}

export interface SetupItem { key: string; done: boolean; href: string }
export interface SetupData { items: SetupItem[]; done: number; total: number }

export interface WorkspaceSettings { weekly_target: number; follow_up_days: number }
export interface Features { pipeline: boolean; gmail: boolean }

export const overviewApi = {
  summary: (days: number) =>
    apiClient.get<OverviewSummary>("/api/v1/overview/summary", { params: { days } }).then((r) => r.data),
  today: () => apiClient.get<TodayData>("/api/v1/overview/today").then((r) => r.data),
  setup: () => apiClient.get<SetupData>("/api/v1/overview/setup").then((r) => r.data),
  getSettings: () => apiClient.get<WorkspaceSettings>("/api/v1/workspace/settings").then((r) => r.data),
  updateSettings: (data: Partial<WorkspaceSettings>) =>
    apiClient.put<WorkspaceSettings>("/api/v1/workspace/settings", data).then((r) => r.data),
  features: () => apiClient.get<Features>("/api/v1/workspace/features").then((r) => r.data),
};
