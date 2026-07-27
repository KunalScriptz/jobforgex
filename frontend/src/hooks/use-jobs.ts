import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { jobsApi, Job, JobStatus, JobDetail } from "@/api/jobs";

export function useJobs(params?: { board_id?: string; search?: string; status?: string }) {
  return useQuery<Job[]>({
    queryKey: ["jobs", params],
    queryFn: () => jobsApi.listJobs(params),
    staleTime: 30 * 1000,
  });
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });
}

export function useUpdateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<Job>) => jobsApi.updateJob(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });
}

export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: jobsApi.deleteJob,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });
}

export function useBulkUpdateStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: JobStatus }) =>
      jobsApi.bulkUpdateStatus(ids, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });
}

export function useBulkDeleteJobs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => jobsApi.bulkDelete(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });
}
