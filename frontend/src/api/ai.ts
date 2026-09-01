import apiClient from "./client";

export interface AiGenerateResult {
  content: string;
  input_tokens: number;
  output_tokens: number;
  total_cost: number;
  model_name: string;
  cache_hit_tokens?: number;
}

export interface ResumeEditResult {
  answer: string;
  updated_latex: string | null;
  page_count: number;
}

export interface AtsScoreResult {
  ats_score: number;
  keyword_match: number;
  matched_keywords: string[];
  missing_keywords: string[];
  format_checks: Record<string, boolean>;
  summary: string;
  suggestions: string[];
}

export const aiApi = {
  generate: (data: {
    prompt_name: string;
    vars: Record<string, string | number>;
    job_id?: string;
    purpose?: string;
    override_temperature?: number;
  }) => apiClient.post<AiGenerateResult>("/api/v1/ai/generate", data).then((r) => r.data),

  editResume: (data: { latex_source: string; question: string; job_id?: string }) =>
    apiClient.post<ResumeEditResult>("/api/v1/ai/edit-resume", data).then((r) => r.data),

  atsScore: (data: { job_id: string; latex_source: string }) =>
    apiClient.post<AtsScoreResult>("/api/v1/ai/ats-score", data).then((r) => r.data),

  checkEntitlement: (jobId?: string) =>
    apiClient.get<{ allowed: boolean }>("/api/v1/ai/entitlement", { params: { job_id: jobId } }).then((r) => r.data),
};
