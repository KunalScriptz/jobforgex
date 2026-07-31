import apiClient from "./client";

export interface Resume {
  id: string;
  workspace_id: string;
  name: string;
  latex_source: string;
  page_count: number;
  primary_color: string;
  secondary_color: string;
  is_base: boolean;
  created_at: string;
  updated_at: string;
}

export interface ResumeVersion {
  id: string;
  resume_id: string;
  latex_source: string;
  note: string | null;
  created_at: string;
}

const API_BASE = import.meta.env.VITE_API_URL || "";

export const resumesApi = {
  listResumes: () =>
    apiClient.get<Resume[]>("/api/v1/resumes/").then((r) => r.data),

  getBaseResume: () =>
    apiClient.get<Resume | null>("/api/v1/resumes/base").then((r) => r.data),

  saveBaseResume: (data: { latex_source: string; name?: string }) =>
    apiClient.post<Resume>("/api/v1/resumes/base", data).then((r) => r.data),

  updateColors: (resumeId: string, primary: string, secondary: string) =>
    apiClient
      .put(`/api/v1/resumes/${resumeId}/colors`, null, {
        params: { primary_color: primary, secondary_color: secondary },
      })
      .then((r) => r.data),

  listVersions: (resumeId: string) =>
    apiClient.get<ResumeVersion[]>(`/api/v1/resumes/${resumeId}/versions`).then((r) => r.data),

  compileArtifact: (artifactId: string) =>
    apiClient
      .post<{ ok: boolean; storage_path?: string; error?: string }>("/api/v1/resumes/compile", {
        artifact_id: artifactId,
      })
      .then((r) => r.data),

  getPdfUrl: (artifactId: string, inline?: boolean) =>
    apiClient
      .post<{ url: string; filename: string }>("/api/v1/resumes/pdf-url", {
        artifact_id: artifactId,
        inline,
      })
      .then((r) => ({ ...r.data, url: `${API_BASE}${r.data.url}` })),
};
