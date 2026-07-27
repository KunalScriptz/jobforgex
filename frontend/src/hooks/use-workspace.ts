import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { workspaceApi, Board } from "@/api/workspace";

export function useWorkspace() {
  return useQuery({
    queryKey: ["workspace", "me"],
    queryFn: workspaceApi.getMyWorkspace,
    staleTime: 5 * 60 * 1000,
  });
}

export function useBoards() {
  return useQuery<Board[]>({
    queryKey: ["boards"],
    queryFn: workspaceApi.listBoards,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => workspaceApi.createBoard(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["boards"] }),
  });
}

export function useDeleteBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => workspaceApi.deleteBoard(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["boards"] }),
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: workspaceApi.createWorkspace,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace", "me"] }),
  });
}
