import apiClient from "./client";

export interface AiGenerateResult {
  content: string;
  input_tokens: number;
  output_tokens: number;
  total_cost: number;
  model_name: string;
}

export const aiApi = {
  generate: (data: {
    prompt_name: string;
    vars: Record<string, string | number>;
    job_id?: string;
    purpose?: string;
    override_temperature?: number;
  }) => apiClient.post<AiGenerateResult>("/api/v1/ai/generate", data).then((r) => r.data),

  checkEntitlement: (jobId?: string) =>
    apiClient.get<{ allowed: boolean }>("/api/v1/ai/entitlement", { params: { job_id: jobId } }).then((r) => r.data),
};
