import apiClient from "./client";

export type DiscoveredState = "new" | "added" | "dismissed";

export interface SourceOption {
  name: string;
  label: string;
  requires_country: boolean;
  india_only: boolean;
  needs_proxy_hint: boolean;
}

export interface DiscoveryOptions {
  sources: SourceOption[];
  countries: string[];
  max_searches: number;
  hours_old_range: [number, number];
  results_wanted_range: [number, number];
}

export interface SourceResult {
  ok: boolean;
  found?: number;
  new?: number;
  error?: string;
}

export interface DiscoverySearch {
  id: string;
  name: string;
  search_term: string;
  location: string | null;
  country: string | null;
  sites: string[];
  is_remote: boolean;
  hours_old: number;
  results_wanted: number;
  enabled: boolean;
  last_run_at: string | null;
  last_status: "ok" | "partial" | "failed" | null;
  last_result: Record<string, SourceResult> | null;
  last_error: string | null;
  created_at: string;
}

export type SearchInput = Omit<
  DiscoverySearch,
  "id" | "last_run_at" | "last_status" | "last_result" | "last_error" | "created_at"
>;

export interface DiscoveredJob {
  id: string;
  search_id: string | null;
  source: string;
  title: string;
  company: string;
  location: string | null;
  url: string;
  description: string;
  date_posted: string | null;
  salary_text: string | null;
  is_remote: boolean | null;
  keyword_score: number;
  fit_score: number | null;
  fit_reason: string | null;
  state: DiscoveredState;
  added_job_id: string | null;
  possible_duplicate: boolean;
  first_seen_at: string;
}

export interface DiscoveryStatus {
  enabled: boolean;
  new_count: number;
  added_count: number;
  dismissed_count: number;
  last_run_at: string | null;
  ai_scored_pending: number;
  proxy_configured: boolean;
}

export interface JobsParams {
  state?: DiscoveredState;
  source?: string;
  min_fit?: number;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface BulkResult {
  done: number;
  duplicates: number;
  missing: number;
}

const base = "/api/v1/discovery";

export const discoveryApi = {
  options: () => apiClient.get<DiscoveryOptions>(`${base}/options`).then((r) => r.data),
  status: () => apiClient.get<DiscoveryStatus>(`${base}/status`).then((r) => r.data),
  setEnabled: (enabled: boolean) =>
    apiClient.put<DiscoveryStatus>(`${base}/settings`, { enabled }).then((r) => r.data),

  listSearches: () => apiClient.get<DiscoverySearch[]>(`${base}/searches`).then((r) => r.data),
  createSearch: (data: SearchInput) =>
    apiClient.post<DiscoverySearch>(`${base}/searches`, data).then((r) => r.data),
  updateSearch: (id: string, data: Partial<SearchInput>) =>
    apiClient.put<DiscoverySearch>(`${base}/searches/${id}`, data).then((r) => r.data),
  deleteSearch: (id: string) => apiClient.delete(`${base}/searches/${id}`).then((r) => r.data),

  listJobs: (params: JobsParams) =>
    apiClient
      .get<{ items: DiscoveredJob[]; total: number }>(`${base}/jobs`, { params })
      .then((r) => r.data),
  bulk: (ids: string[], action: "add" | "dismiss") =>
    apiClient.post<BulkResult>(`${base}/jobs/bulk`, { ids, action }).then((r) => r.data),

  run: () => apiClient.post<{ queued: boolean }>(`${base}/run`).then((r) => r.data),
};
