import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";

export interface HomeBlock {
  key: string;
  body: string;
  enabled: boolean;
  updated_at: string;
  updated_by: string | null;
}

interface HomeBlocksList {
  blocks: HomeBlock[];
}

const KEY = ["home-blocks"] as const;

export function useHomeBlocks() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data } = await apiClient.get<HomeBlocksList>("/home-blocks");
      return data.blocks;
    },
    staleTime: 60_000,
  });
}

export function useHomeBlock(key: string) {
  const { data, ...rest } = useHomeBlocks();
  return { data: data?.find((b) => b.key === key), ...rest };
}

export function useUpdateHomeBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, body, enabled }: { key: string; body: string; enabled: boolean }) => {
      const { data } = await apiClient.put<HomeBlock>(
        `/home-blocks/${encodeURIComponent(key)}`,
        { body, enabled },
      );
      return data;
    },
    onSuccess: (updated) => {
      const cached = qc.getQueryData<HomeBlock[]>(KEY) ?? [];
      const next = cached.some((b) => b.key === updated.key)
        ? cached.map((b) => (b.key === updated.key ? updated : b))
        : [...cached, updated];
      qc.setQueryData(KEY, next);
    },
  });
}
