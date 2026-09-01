import apiClient from "./client";

export type JobStatus = "wishlist" | "applied" | "interview" | "rejected" | "offer";
export type ArtifactKind = "tailored_resume" | "cover_letter" | "ai_tool" | "pdf";

export interface Job {
  id: string;
  workspace_id: string;
  board_id: string;
  company: string;
  company_domain: string | null;
  title: string;
  description: string;
  url: string | null;
  notes: string | null;
  location: string | null;
  status: JobStatus;
  date_applied: string | null;
  resume_score: number | null;
  insights: any;
  base_fit_score: any;
  created_at: string;
  updated_at: string;
}

export interface JobArtifact {
  id: string;
  workspace_id: string;
  job_id: string;
  kind: ArtifactKind;
  filename: string;
  latex_source: string;
  pdf_storage_path: string | null;
  compile_error: string | null;
  fit_score: any;
  created_at: string;
}

export interface JobDetail {
  job: Job | null;
  artifacts: JobArtifact[];
  costs: any[];
}

export const jobsApi = {
  listJobs: (params?: { board_id?: string; search?: string; status?: string }) =>
    apiClient.get<Job[]>("/api/v1/jobs/", { params }).then((r) => r.data),

  exportJobs: () =>
    apiClient.get<Blob>("/api/v1/jobs/export", { responseType: "blob" }).then((r) => r.data),

  getJob: (id: string) =>
    apiClient.get<JobDetail>(`/api/v1/jobs/${id}`).then((r) => r.data),

  getCompanyInfo: (id: string) =>
    apiClient
      .get<{ company: string; domain: string; website: string; description: string | null; url: string | null; source: string | null }>(
        `/api/v1/jobs/${id}/company-info`,
      )
      .then((r) => r.data),

  createJob: (data: Partial<Job> & { board_id: string; company: string; title: string }) =>
    apiClient.post<Job>("/api/v1/jobs/", data).then((r) => r.data),

  updateJob: (id: string, data: Partial<Job>) =>
    apiClient.put(`/api/v1/jobs/${id}`, data).then((r) => r.data),

  deleteJob: (id: string) =>
    apiClient.delete(`/api/v1/jobs/${id}`).then((r) => r.data),

  bulkUpdateStatus: (ids: string[], status: JobStatus) =>
    apiClient.post("/api/v1/jobs/bulk-status", { ids, status }).then((r) => r.data),

  bulkDelete: (ids: string[]) =>
    apiClient.post("/api/v1/jobs/bulk-delete", { ids }).then((r) => r.data),

  listArtifacts: (jobId: string) =>
    apiClient.get<JobArtifact[]>(`/api/v1/jobs/artifacts/${jobId}`).then((r) => r.data),

  deleteArtifact: (artifactId: string) =>
    apiClient.delete(`/api/v1/jobs/artifacts/${artifactId}`).then((r) => r.data),
};
