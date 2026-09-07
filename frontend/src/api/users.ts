import apiClient from "./client";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  current_salary: number | null;
  salary_currency: string | null;
  salary_frequency: string | null;
  location: string | null;
  profile_complete: boolean;
}

export type UserProfileUpdate = Partial<
  Pick<UserProfile, "full_name" | "current_salary" | "salary_currency" | "salary_frequency" | "location">
>;

export const usersApi = {
  getMe: () => apiClient.get<UserProfile>("/api/v1/users/me").then((r) => r.data),

  updateMe: (data: UserProfileUpdate) =>
    apiClient.patch<UserProfile>("/api/v1/users/me", data).then((r) => r.data),
};
