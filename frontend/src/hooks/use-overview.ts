import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { overviewApi, type Features, type WorkspaceSettings } from "@/api/overview";

export function useOverview(days: number) {
  return useQuery({
    queryKey: ["overview", "summary", days],
    queryFn: () => overviewApi.summary(days),
    staleTime: 60_000,
  });
}

export function useToday() {
  return useQuery({ queryKey: ["overview", "today"], queryFn: overviewApi.today, staleTime: 30_000 });
}

export function useSetup() {
  return useQuery({ queryKey: ["overview", "setup"], queryFn: overviewApi.setup, staleTime: 60_000 });
}

export function useWorkspaceSettings() {
  return useQuery({ queryKey: ["workspace", "settings"], queryFn: overviewApi.getSettings, staleTime: 5 * 60_000 });
}

export function useUpdateWorkspaceSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<WorkspaceSettings>) => overviewApi.updateSettings(data),
    onSuccess: (data) => {
      qc.setQueryData(["workspace", "settings"], data);
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });
}

const NO_FEATURES: Features = { pipeline: false, gmail: false };

/** Feature flags for this deployment. Until loaded (or on error) everything optional is off. */
export function useFeatures(): Features {
  const { data } = useQuery({ queryKey: ["workspace", "features"], queryFn: overviewApi.features, staleTime: 10 * 60_000 });
  return data ?? NO_FEATURES;
}
