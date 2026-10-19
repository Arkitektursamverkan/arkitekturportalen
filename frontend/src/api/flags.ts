import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import type { FlagType, NodeFlag } from "@/types/graph";

export const flagKeys = {
  all: ["flags"] as const,
  allFlags: () => [...flagKeys.all, "all"] as const,
  byNode: (nodeId: string) => [...flagKeys.all, "node", nodeId] as const,
};

export function useAllFlags() {
  return useQuery({
    queryKey: flagKeys.allFlags(),
    queryFn: async () => {
      const { data } = await apiClient.get<NodeFlag[]>("/flags");
      return data;
    },
    staleTime: 0,
  });
}

export function useNodeFlags(nodeId: string | undefined) {
  return useQuery({
    queryKey: flagKeys.byNode(nodeId ?? ""),
    queryFn: async () => {
      const { data } = await apiClient.get<NodeFlag[]>(`/nodes/${nodeId}/flags`);
      return data;
    },
    enabled: Boolean(nodeId),
    staleTime: 0,
  });
}

export function useCreateFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ nodeId, flag_type, description }: { nodeId: string; flag_type: FlagType; description: string | null }) =>
      apiClient.post<NodeFlag>(`/nodes/${nodeId}/flags`, { flag_type, description }).then((r) => r.data),
    onSuccess: (_data, { nodeId }) => {
      qc.refetchQueries({ queryKey: flagKeys.byNode(nodeId) });
      qc.refetchQueries({ queryKey: flagKeys.allFlags() });
    },
  });
}

export function useDeleteFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ nodeId, flagId }: { nodeId: string; flagId: string }) =>
      apiClient.delete(`/nodes/${nodeId}/flags/${flagId}`),
    onSuccess: (_data, { nodeId }) => {
      qc.refetchQueries({ queryKey: flagKeys.byNode(nodeId) });
      qc.refetchQueries({ queryKey: flagKeys.allFlags() });
    },
  });
}

export function useRespondToFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ nodeId, flagId, response }: { nodeId: string; flagId: string; response: string | null }) =>
      apiClient.patch<NodeFlag>(`/nodes/${nodeId}/flags/${flagId}/response`, { response }).then((r) => r.data),
    onSuccess: (_data, { nodeId }) => {
      qc.refetchQueries({ queryKey: flagKeys.byNode(nodeId) });
      qc.refetchQueries({ queryKey: flagKeys.allFlags() });
    },
  });
}
