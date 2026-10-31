import { useQuery } from "@tanstack/react-query";
import { workspaceApi } from "@/api/workspace";
import { useAuth } from "@/context/auth-context";

/** Which optional areas this deployment has switched on (GET /workspace/features). */
export function useFeatures() {
  const { isAuthenticated } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["features"],
    queryFn: workspaceApi.getFeatures,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });
  return { features: data, isLoading };
}
