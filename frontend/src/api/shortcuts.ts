import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";

interface HomeShortcuts {
  paths: string[];
}

const KEY = ["me", "shortcuts"] as const;

export function useShortcuts() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data } = await apiClient.get<HomeShortcuts>("/users/me/shortcuts");
      return data.paths;
    },
    staleTime: 60_000,
  });
}

export function useUpdateShortcuts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (paths: string[]) => {
      const { data } = await apiClient.put<HomeShortcuts>("/users/me/shortcuts", { paths });
      return data.paths;
    },
    onSuccess: (paths) => qc.setQueryData(KEY, paths),
  });
}
