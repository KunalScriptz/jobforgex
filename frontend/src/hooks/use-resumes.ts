import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { resumesApi } from "@/api/resumes";

export function useResumes() {
  return useQuery({
    queryKey: ["resumes"],
    queryFn: resumesApi.listResumes,
    staleTime: 5 * 60 * 1000,
  });
}

export function useBaseResume() {
  return useQuery({
    queryKey: ["resumes", "base"],
    queryFn: resumesApi.getBaseResume,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveBaseResume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: resumesApi.saveBaseResume,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resumes"] });
      qc.invalidateQueries({ queryKey: ["resumes", "base"] });
    },
  });
}

function useInvalidateResumes() {
  const qc = useQueryClient();
  return () => {
    // Prefix invalidation covers ["resumes"], ["resumes","base"], and ["resumes","versions",…].
    qc.invalidateQueries({ queryKey: ["resumes"] });
  };
}

export function useCreateTemplate() {
  const invalidate = useInvalidateResumes();
  return useMutation({
    mutationFn: resumesApi.createTemplate,
    onSuccess: invalidate,
  });
}

export function useDeleteTemplate() {
  const invalidate = useInvalidateResumes();
  return useMutation({
    mutationFn: resumesApi.deleteTemplate,
    onSuccess: invalidate,
  });
}

export function useSetDefaultTemplate() {
  const invalidate = useInvalidateResumes();
  return useMutation({
    mutationFn: resumesApi.setDefaultTemplate,
    onSuccess: invalidate,
  });
}

export function useResumeVersions(resumeId: string) {
  return useQuery({
    queryKey: ["resumes", "versions", resumeId],
    queryFn: () => resumesApi.listVersions(resumeId),
    enabled: !!resumeId,
  });
}

export function useCompileArtifact() {
  return useMutation({
    mutationFn: resumesApi.compileArtifact,
  });
}
