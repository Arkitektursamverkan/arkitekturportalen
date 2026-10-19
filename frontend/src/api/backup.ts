import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";

export interface Snapshot {
  filename: string;
  label: string;
  created_at: string;
  node_count: number;
  edge_count: number;
}

export interface RestoreResult {
  nodes_restored: number;
  edges_restored: number;
  /** Objects that already existed and were updated in place, keeping their id. */
  nodes_kept?: number;
}

export function useExportDatabase() {
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.get("/backup/export", {
        responseType: "blob",
      });
      return data as Blob;
    },
  });
}

export function useRestoreDatabase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const { data } = await apiClient.post<RestoreResult>("/backup/restore", form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120_000,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useSnapshots() {
  return useQuery({
    queryKey: ["backup", "snapshots"],
    queryFn: async () => {
      const { data } = await apiClient.get<Snapshot[]>("/backup/snapshots");
      return data;
    },
  });
}

export function useCreateSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (label: string) => {
      const { data } = await apiClient.post<Snapshot>("/backup/snapshots", null, {
        params: { label },
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["backup", "snapshots"] }),
  });
}

export function useRestoreSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (filename: string) => {
      const { data } = await apiClient.post<RestoreResult>(`/backup/snapshots/${filename}/restore`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useDeleteSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (filename: string) => {
      await apiClient.delete(`/backup/snapshots/${filename}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["backup", "snapshots"] }),
  });
}
