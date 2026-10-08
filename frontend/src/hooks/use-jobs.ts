import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { jobsApi, Job, JobStatus, JobDetail, JobCard, JobCardParams, JobStats } from "@/api/jobs";

/** Anything that changes a job also changes the Overview / Today numbers derived from it. */
export function invalidateJobs(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["jobs"] });
  qc.invalidateQueries({ queryKey: ["overview"] });
}

export function useJobs(params?: { board_id?: string; search?: string; status?: string }) {
  return useQuery<Job[]>({
    queryKey: ["jobs", params],
    queryFn: () => jobsApi.listJobs(params),
    staleTime: 30 * 1000,
    // Poll so jobs saved from the Chrome extension appear without a manual refresh.
    refetchInterval: 15 * 1000,
  });
}

/** Slim job cards (no description). Use this for boards and lists; `useJobs` returns full jobs. */
export function useJobCards(params?: JobCardParams, options?: { enabled?: boolean }) {
  return useQuery<{ jobs: JobCard[]; total: number }>({
    queryKey: ["jobs", "cards", params],
    queryFn: () => jobsApi.listCards(params),
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
    // Pick up jobs saved from the Chrome extension without hammering the API.
    refetchInterval: 60 * 1000,
  });
}

export function useJobStats() {
  return useQuery<JobStats>({ queryKey: ["jobs", "stats"], queryFn: jobsApi.stats, staleTime: 30 * 1000 });
}

export function useJobDetail(jobId: string) {
  return useQuery<JobDetail>({
    queryKey: ["jobs", jobId],
    queryFn: () => jobsApi.getJob(jobId),
    enabled: !!jobId,
  });
}

export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: jobsApi.createJob,
    onSuccess: () => invalidateJobs(qc),
  });
}

export function useUpdateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<Job>) => jobsApi.updateJob(id, data),
    onSuccess: () => invalidateJobs(qc),
  });
}

export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: jobsApi.deleteJob,
    onSuccess: () => invalidateJobs(qc),
  });
}

export function useBulkUpdateStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: JobStatus }) =>
      jobsApi.bulkUpdateStatus(ids, status),
    onSuccess: () => invalidateJobs(qc),
  });
}

export function useBulkDeleteJobs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => jobsApi.bulkDelete(ids),
    onSuccess: () => invalidateJobs(qc),
  });
}
