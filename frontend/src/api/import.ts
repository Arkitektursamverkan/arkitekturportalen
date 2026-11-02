import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import { triggerDownload } from "./targetArchitecture";

export type CsvPreviewRow = Record<string, string>;

export interface CsvPreviewResult {
  rows: CsvPreviewRow[];
  errors: string[];
  total: number;
}

export interface CsvImportResult {
  source: string;
  total: number;
  created: number;
  updated: number;
  errors: string[];
}

interface ImportResult {
  source: string;
  mode: string;
  total: number;
  created: number;
  updated: number;
  errors: string[];
}

export function useImportSharePoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mode: "mock" | "api" = "mock") =>
      apiClient.post<ImportResult>(`/import/sharepoint?mode=${mode}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nodes"] }),
  });
}

export function useImport2C8() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mode: "mock" | "api" = "mock") =>
      apiClient.post<ImportResult>(`/import/2c8?mode=${mode}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nodes"] }),
  });
}

export function usePreviewCsv() {
  return useMutation({
    mutationFn: ({ entity, file }: { entity: string; file: File }) => {
      const fd = new FormData();
      fd.append("file", file);
      return apiClient
        .post<CsvPreviewResult>(`/import/csv/preview/${entity}`, fd, {
          headers: { "Content-Type": undefined },
        })
        .then((r) => r.data);
    },
  });
}

export function useImportCsv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entity, file }: { entity: string; file: File }) => {
      const fd = new FormData();
      fd.append("file", file);
      return apiClient
        .post<CsvImportResult>(`/import/csv/${entity}`, fd, {
          headers: { "Content-Type": undefined },
        })
        .then((r) => r.data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nodes"] }),
  });
}

export interface UnifiedPreviewResult {
  nodes: Record<string, string>[];
  edges: { source: string; target: string; type: string }[];
  errors: string[];
  total_nodes: number;
  total_edges: number;
}

export interface UnifiedImportResult {
  source: string;
  nodes_created: number;
  nodes_updated: number;
  edges_created: number;
  errors: string[];
}

export function usePreviewUnifiedCsv() {
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return apiClient
        .post<UnifiedPreviewResult>("/import/csv/preview/unified", fd, {
          headers: { "Content-Type": undefined },
        })
        .then((r) => r.data);
    },
  });
}

export function useImportUnifiedCsv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return apiClient
        .post<UnifiedImportResult>("/import/csv/unified", fd, {
          headers: { "Content-Type": undefined },
        })
        .then((r) => r.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nodes"] });
      qc.invalidateQueries({ queryKey: ["edges"] });
      qc.invalidateQueries({ queryKey: ["views"] });
    },
  });
}

export function useSeedStatus() {
  return useQuery({
    queryKey: ["seed-status"],
    queryFn: () => apiClient.get<{ available: boolean }>("/seed/status").then((r) => r.data),
  });
}

export function useSeedDatabase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post("/seed").then((r) => r.data),
    onSuccess: () => qc.invalidateQueries(),
  });
}

/** The whole model as CSV. Fetched with the user's token, not a plain link:
    reading without signing in may be switched off. */
export async function downloadCsvExport(): Promise<void> {
  const { data } = await apiClient.get<Blob>("/import/csv/export", { responseType: "blob", timeout: 120_000 });
  triggerDownload(data, "ea_export.csv");
}
