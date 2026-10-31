import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { discoveryApi, JobsParams, SearchInput } from "@/api/discovery";
import { apiErrorMessage } from "@/hooks/use-admin";

const KEY = ["discovery"] as const;

export function useDiscoveryOptions() {
  return useQuery({ queryKey: [...KEY, "options"], queryFn: discoveryApi.options, staleTime: Infinity });
}

export function useDiscoveryStatus() {
  return useQuery({
    queryKey: [...KEY, "status"],
    queryFn: discoveryApi.status,
    // A run is queued and finishes in the background: poll lightly so new postings just show up.
    refetchInterval: 20 * 1000,
  });
}

export function useDiscoverySearches() {
  return useQuery({ queryKey: [...KEY, "searches"], queryFn: discoveryApi.listSearches, refetchInterval: 20 * 1000 });
}

export function useDiscoveredJobs(params: JobsParams) {
  return useQuery({
    queryKey: [...KEY, "jobs", params],
    queryFn: () => discoveryApi.listJobs(params),
    placeholderData: keepPreviousData,
    refetchInterval: 20 * 1000,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: KEY });
}

export function useSaveSearch() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: SearchInput }) =>
      id ? discoveryApi.updateSearch(id, data) : discoveryApi.createSearch(data),
    onSuccess: () => {
      toast.success("Search saved");
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Could not save the search")),
  });
}

export function useToggleSearch() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => discoveryApi.updateSearch(id, { enabled }),
    onSuccess: invalidate,
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
}

export function useDeleteSearch() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: discoveryApi.deleteSearch,
    onSuccess: invalidate,
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
}

export function useSetDiscoveryEnabled() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: discoveryApi.setEnabled,
    onSuccess: invalidate,
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
}

export function useRunDiscovery() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: discoveryApi.run,
    onSuccess: () => {
      toast.success("Search started. New jobs will appear here as they are found.");
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Could not start the search")),
  });
}

export function useTriage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: "add" | "dismiss" }) => discoveryApi.bulk(ids, action),
    onSuccess: (r, { action }) => {
      if (action === "add") {
        toast.success(`${r.done} added to your board${r.duplicates ? ` (${r.duplicates} already saved)` : ""}`);
        qc.invalidateQueries({ queryKey: ["jobs"] });
      } else {
        toast.success(`${r.done} dismissed`);
      }
      qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Something went wrong")),
  });
}
