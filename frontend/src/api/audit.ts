import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import { nodeKeys } from "./nodes";

export interface AuditLogEntry {
  id: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "PROPOSE" | "PROPOSE_DONE" | "PROPOSE_REJECT" | "PROPOSE_WITHDRAW";
  entity_type: "node" | "edge";
  entity_id: string;
  entity_name: string | null;
  entity_subtype: string | null;
  snapshot_before: Record<string, unknown> | null;
  snapshot_after: Record<string, unknown> | null;
  restored: boolean;
  created_at: string;
  user_name?: string | null;
  change_note?: string | null;
}

export interface AuditLogList {
  items: AuditLogEntry[];
  total: number;
}

export const auditKeys = {
  all: ["audit"] as const,
  list: (filters?: Record<string, unknown>) => [...auditKeys.all, "list", filters] as const,
};

export function useAuditLog(filters?: {
  entity_type?: string;
  action?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: auditKeys.list(filters),
    queryFn: async () => {
      const { data } = await apiClient.get<AuditLogList>("/audit", { params: filters });
      return data;
    },
  });
}

export function useClearAuditLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete<{ deleted: number }>("/audit").then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: auditKeys.all }),
  });
}

export function useRestoreEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, restoreEdges = true }: { id: string; restoreEdges?: boolean }) =>
      apiClient.post<{ message: string; restored_id: string }>(`/audit/${id}/restore`, null, { params: { restore_edges: restoreEdges } }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: auditKeys.all });
      qc.invalidateQueries({ queryKey: nodeKeys.all });
      qc.invalidateQueries({ queryKey: ["edges"] });
      qc.invalidateQueries({ queryKey: ["views"] });
    },
  });
}
