import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";

export interface GraphSnapshotAuditEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_subtype: string | null;
  entity_name: string | null;
  user_name: string | null;
  change_note: string | null;
  created_at: string;
}

export interface GraphSnapshotListItem {
  id: string;
  snapshot_number: number;
  label: string | null;
  node_count: number;
  edge_count: number;
  triggered_by: string;
  audit_entries: GraphSnapshotAuditEntry[];
  created_at: string;
  created_by: string | null;
}

const SNAPSHOTS_KEY = ["graph", "snapshots"] as const;

export function useGraphSnapshots() {
  return useQuery({
    queryKey: SNAPSHOTS_KEY,
    queryFn: async () => {
      const { data } = await apiClient.get<GraphSnapshotListItem[]>("/graph/snapshots");
      return data;
    },
  });
}

export function useCreateGraphSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (label: string | null) => {
      const { data } = await apiClient.post<GraphSnapshotListItem>("/graph/snapshots", {
        label: label || null,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SNAPSHOTS_KEY }),
  });
}
