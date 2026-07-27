import apiClient from "./client";

export interface ExtensionToken {
  id: string;
  user_id: string;
  workspace_id: string;
  label: string;
  token_prefix: string;
  last_used_at: string | null;
  created_at: string;
}

export interface ExtensionTokenCreated {
  id: string;
  token: string;
  prefix: string;
  label: string;
}

export const extensionApi = {
  listTokens: () =>
    apiClient.get<ExtensionToken[]>("/api/v1/extension/tokens").then((r) => r.data),

  createToken: (label?: string) =>
    apiClient
      .post<ExtensionTokenCreated>("/api/v1/extension/tokens", { label: label || "" })
      .then((r) => r.data),

  revokeToken: (id: string) =>
    apiClient.delete(`/api/v1/extension/tokens/${id}`).then((r) => r.data),
};
