import apiClient from "./client";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  current_salary: number | null;
  salary_currency: string | null;
  salary_frequency: string | null;
  location: string | null;
  avatar_preset: string | null;
  phone: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  current_title: string | null;
  current_company: string | null;
  profile_complete: boolean;
}

export type UserProfileUpdate = Partial<
  Pick<
    UserProfile,
    | "full_name"
    | "current_salary"
    | "salary_currency"
    | "salary_frequency"
    | "location"
    | "avatar_preset"
    | "phone"
    | "linkedin_url"
    | "portfolio_url"
    | "current_title"
    | "current_company"
  >
>;

export const usersApi = {
  getMe: () => apiClient.get<UserProfile>("/api/v1/users/me").then((r) => r.data),

  updateMe: (data: UserProfileUpdate) =>
    apiClient.patch<UserProfile>("/api/v1/users/me", data).then((r) => r.data),
};
