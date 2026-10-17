import { useQuery } from "@tanstack/react-query";
import { usersApi } from "@/api/users";
import { useAuth } from "@/context/auth-context";

/**
 * True when the database says this user is an admin. Reads the same ["me"] profile query the
 * sidebar already makes, because the JWT role claim can lag a promotion or demotion by up to 15
 * minutes. The backend enforces admin access on every /admin route either way; this only decides
 * what the UI shows.
 */
export function useIsAdmin() {
  const { isAuthenticated } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => usersApi.getMe(),
    enabled: isAuthenticated,
  });
  return { isAdmin: data?.is_admin === true, isLoading };
}

/** Pull the API's `detail` message out of an axios error, falling back to a generic line. */
export function apiErrorMessage(err: unknown, fallback = "Something went wrong"): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === "string" ? detail : fallback;
}
