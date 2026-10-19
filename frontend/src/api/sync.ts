import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";

export interface SyncProfile {
  flow_id: string;
  flow_name: string;
  node_type: string;
  external_source_label: string;
  platform_url: string;
  platform_api_key: string;
  mappings: Array<{ source_field: string; target: string }>;
  enabled: boolean;
}

export interface SyncResult {
  flow_id: string;
  node_type: string;
  total: number;
  created: number;
  updated: number;
  errors: string[];
}

export function useSyncProfiles() {
  return useQuery<SyncProfile[]>({
    queryKey: ["sync-profiles"],
    queryFn: () => apiClient.get("/sync/profiles").then((r) => r.data),
  });
}

export function useSaveSyncProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (profile: SyncProfile) =>
      apiClient.post("/sync/profiles", profile).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sync-profiles"] }),
  });
}

export function useDeleteSyncProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (flowId: string) =>
      apiClient.delete(`/sync/profiles/${flowId}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sync-profiles"] }),
  });
}

export function useManualSync() {
  const qc = useQueryClient();
  return useMutation<SyncResult, Error, string>({
    mutationFn: (flowId: string) =>
      apiClient.post(`/sync/profiles/${flowId}/run`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nodes"] });
      qc.invalidateQueries({ queryKey: ["views"] });
    },
  });
}
