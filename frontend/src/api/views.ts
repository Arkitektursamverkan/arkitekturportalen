import { useQuery } from "@tanstack/react-query";
import { apiClient } from "./client";
import type { GraphData, OverlapGapsData } from "@/types/graph";

export function useProcessE2E(processId: string | undefined) {
  return useQuery({
    queryKey: ["views", "process", processId],
    queryFn: async () => {
      const { data } = await apiClient.get<GraphData>(`/views/process/${processId}`);
      return data;
    },
    enabled: Boolean(processId),
  });
}

export function useSystemView(appId: string | undefined) {
  return useQuery({
    queryKey: ["views", "system", appId],
    queryFn: async () => {
      const { data } = await apiClient.get<GraphData>(`/views/system/${appId}`);
      return data;
    },
    enabled: Boolean(appId),
  });
}

export function useLandscape() {
  return useQuery({
    queryKey: ["views", "landscape"],
    queryFn: async () => {
      const { data } = await apiClient.get<GraphData>("/views/landscape");
      return data;
    },
  });
}

export function useOverlapGaps() {
  return useQuery({
    queryKey: ["views", "overlap-gaps"],
    queryFn: async () => {
      const { data } = await apiClient.get<OverlapGapsData>("/views/overlap-gaps");
      return data;
    },
  });
}
