import apiClient from "./client";

export interface Workspace {
  id: string;
  owner_user_id: string;
  name: string;
  timezone: string;
  plan: string;
  currency: string;
  onboarding_step: number;
  onboarding_complete: boolean;
  trial_apps_limit: number;
  created_at: string;
  updated_at: string;
}

export interface Board {
  id: string;
  workspace_id: string;
  name: string;
  created_at: string;
}

export const workspaceApi = {
  getMyWorkspace: () =>
    apiClient.get<Workspace | null>("/api/v1/workspace/me").then((r) => r.data),

  createWorkspace: (data: { name: string; timezone?: string }) =>
    apiClient.post<Workspace>("/api/v1/workspace/create", data).then((r) => r.data),

  updateOnboarding: (step: number, complete?: boolean) =>
    apiClient
      .post<Workspace>("/api/v1/workspace/onboarding", null, {
        params: { step, complete: complete ?? false },
      })
      .then((r) => r.data),

  listBoards: () =>
    apiClient.get<Board[]>("/api/v1/workspace/boards").then((r) => r.data),

  createBoard: (name: string) =>
    apiClient.post<Board>("/api/v1/workspace/boards", { name }).then((r) => r.data),

  deleteBoard: (id: string) =>
    apiClient.delete(`/api/v1/workspace/boards/${id}`).then((r) => r.data),

  renameBoard: (id: string, name: string) =>
    apiClient.put(`/api/v1/workspace/boards/${id}`, { name }).then((r) => r.data),

  updateBudget: (budget: number | null) =>
    apiClient.post("/api/v1/workspace/budget", { monthly_budget_usd: budget }).then((r) => r.data),
};
