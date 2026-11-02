import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";

export interface PlatformSource {
  flow_id: string;
  flow_name: string;
  connector_type: string;
  record_count: number;
  last_sync: string | null;
  status: string;
}

export interface SourceField {
  name: string;
  sample: string;
}

export interface NodeTypeField {
  target: string;
  label: string;
  required?: boolean;
}

export interface NodeTypeInfo {
  type: string;
  /** The name of an own list; the others are shown by their type. */
  label?: string;
  core_fields: NodeTypeField[];
  suggested_attributes: NodeTypeField[];
}

export interface FieldMapping {
  source_field: string;
  target: string;
}

export interface PlatformImportRequest {
  platform_url: string;
  platform_api_key: string;
  flow_id: string;
  node_type: string;
  external_source_label: string;
  mappings: FieldMapping[];
}

export interface PlatformImportResult {
  source: string;
  flow_name: string;
  total: number;
  created: number;
  updated: number;
  errors: string[];
}

export function usePlatformSources(platformUrl: string, apiKey: string) {
  return useQuery<PlatformSource[]>({
    queryKey: ["platform-sources", platformUrl, apiKey],
    queryFn: () =>
      apiClient
        .post("/import/platform/sources", { platform_url: platformUrl, platform_api_key: apiKey })
        .then((r) => r.data),
    enabled: !!apiKey,
    retry: false,
  });
}

export function useSourceFields(flowId: string, platformUrl: string, apiKey: string) {
  return useQuery<{ fields: SourceField[]; record_count: number }>({
    queryKey: ["platform-fields", flowId, platformUrl],
    queryFn: () =>
      apiClient
        .post("/import/platform/sources/fields", {
          platform_url: platformUrl,
          platform_api_key: apiKey,
          flow_id: flowId,
        })
        .then((r) => r.data),
    enabled: !!flowId && !!apiKey,
  });
}

export function useNodeTypes() {
  return useQuery<{ node_types: NodeTypeInfo[] }>({
    queryKey: ["ea-node-types"],
    queryFn: () => apiClient.get("/import/platform/node-types").then((r) => r.data),
  });
}

export function useExecutePlatformImport() {
  const qc = useQueryClient();
  return useMutation<PlatformImportResult, Error, PlatformImportRequest>({
    mutationFn: (data) => apiClient.post("/import/platform/execute", data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nodes"] });
      qc.invalidateQueries({ queryKey: ["views"] });
    },
  });
}
