import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import type { NodeCreate, NodeRead } from "@/types/graph";

export const nodeKeys = {
  all: ["nodes"] as const,
  list: (filters?: Record<string, unknown>) => [...nodeKeys.all, "list", filters] as const,
  detail: (id: string) => [...nodeKeys.all, "detail", id] as const,
};

export function useNodes(filters?: { node_type?: string; external_source?: string }) {
  return useQuery({
    queryKey: nodeKeys.list(filters),
    queryFn: async () => {
      const { data } = await apiClient.get<NodeRead[]>("/nodes", { params: filters });
      return data;
    },
  });
}

export function useNode(id: string | undefined) {
  return useQuery({
    queryKey: nodeKeys.detail(id ?? ""),
    queryFn: async () => {
      const { data } = await apiClient.get<NodeRead>(`/nodes/${id}`);
      return data;
    },
    enabled: Boolean(id),
  });
}

export function useCreateNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: NodeCreate) =>
      apiClient.post<NodeRead>("/nodes", payload).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: nodeKeys.all }),
  });
}

export function useUpdateNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string; name?: string; description?: string | null; attributes?: Record<string, unknown>; archived?: boolean; admin_hidden?: boolean; is_structure?: boolean }) =>
      apiClient.patch<NodeRead>(`/nodes/${id}`, payload).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: nodeKeys.all }),
  });
}

/** Fill in the fields an admin added to the object type; null clears one. */
export function useUpdateNodeFields() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: Record<string, string | null> }) =>
      apiClient.patch<NodeRead>(`/nodes/${id}/fields`, { values }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: nodeKeys.all }),
  });
}

export function useDeleteNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.delete(`/nodes/${id}`, { data: { reason } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nodeKeys.all });
      qc.invalidateQueries({ queryKey: ["views"] });
      qc.invalidateQueries({ queryKey: ["edges"] });
      qc.invalidateQueries({ queryKey: ["admin", "notifications"] });
    },
  });
}

export function useBulkDeleteNodes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filters: { node_type?: string; external_source?: string }) =>
      apiClient.delete<{ deleted: number }>("/nodes", { params: filters }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: nodeKeys.all }),
  });
}
