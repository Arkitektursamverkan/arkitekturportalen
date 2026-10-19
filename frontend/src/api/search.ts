import { useQuery } from "@tanstack/react-query";
import { apiClient } from "./client";
import type { NodeRead } from "@/types/graph";

export function useSearch(query: string, limit = 20) {
  return useQuery({
    queryKey: ["search", query, limit],
    queryFn: async () => {
      const { data } = await apiClient.get<NodeRead[]>("/search", {
        params: { q: query, limit },
      });
      return data;
    },
    enabled: query.length >= 2,
  });
}
