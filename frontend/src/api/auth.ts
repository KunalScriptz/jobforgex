import apiClient from "./client";

export interface LoginData {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  full_name?: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: {
    id: string;
    email: string;
    full_name: string | null;
    email_verified: boolean;
    role: string;
    workspace_id: string | null;
    workspace_name: string | null;
    created_at: string;
  };
}

export const authApi = {
  register: (data: RegisterData) =>
    apiClient.post<AuthResponse>("/api/v1/auth/register", data).then((r) => r.data),

  login: (data: LoginData) =>
    apiClient.post<AuthResponse>("/api/v1/auth/login", data).then((r) => r.data),

  refresh: (refreshToken: string) =>
    apiClient
      .post<{ access_token: string; refresh_token: string }>("/api/v1/auth/refresh", {
        refresh_token: refreshToken,
      })
      .then((r) => r.data),

  logout: (refreshToken: string) =>
    apiClient.post("/api/v1/auth/logout", { refresh_token: refreshToken }),

  forgotPassword: (email: string) =>
    apiClient.post("/api/v1/auth/forgot-password", { email }).then((r) => r.data),

  resetPassword: (token: string, newPassword: string) =>
    apiClient
      .post("/api/v1/auth/reset-password", { token, new_password: newPassword })
      .then((r) => r.data),
};
