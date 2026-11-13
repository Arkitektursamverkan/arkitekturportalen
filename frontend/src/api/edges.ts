import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import type { EdgeCreate, EdgeRead, IntegrationDirection } from "@/types/graph";

export const edgeKeys = {
  all: ["edges"] as const,
  list: (filters?: Record<string, unknown>) => [...edgeKeys.all, "list", filters] as const,
};

export function useEdges(filters?: { source_id?: string; target_id?: string; edge_type?: string }) {
  return useQuery({
    queryKey: edgeKeys.list(filters),
    queryFn: async () => {
      const { data } = await apiClient.get<EdgeRead[]>("/edges", { params: filters });
      return data;
    },
  });
}

export function useCreateEdge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: EdgeCreate) =>
      apiClient.post<EdgeRead>("/edges", payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: edgeKeys.all });
    },
  });
}

export function useUpdateEdgeNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string | null }) =>
      apiClient.patch<EdgeRead>(`/edges/${id}/note`, { note }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: edgeKeys.all });
    },
  });
}

/** Set which way an integration flows: →, ↔ or ←. */
export function useUpdateEdgeDirection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, direction }: { id: string; direction: IntegrationDirection }) =>
      apiClient.patch<EdgeRead>(`/edges/${id}/direction`, { direction }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: edgeKeys.all });
      qc.invalidateQueries({ queryKey: ["views"] });
    },
  });
}

/** Fill in the fields an admin added to the connection type; null clears one. */
export function useUpdateEdgeFields() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: Record<string, string | null> }) =>
      apiClient.patch<EdgeRead>(`/edges/${id}/fields`, { values }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: edgeKeys.all });
      qc.invalidateQueries({ queryKey: ["views"] });
    },
  });
}

export function useDeleteEdge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/edges/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: edgeKeys.all });
      qc.invalidateQueries({ queryKey: ["views"] });
    },
  });
}
