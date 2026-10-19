import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";

export type BannerSeverity = "info" | "warning" | "error";

export interface HomeBanner {
  id: string;
  body: string;
  severity: BannerSeverity;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

interface HomeBannersList {
  banners: HomeBanner[];
}

const KEY = ["home-banners"] as const;

export function useHomeBanners() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data } = await apiClient.get<HomeBannersList>("/home-banners");
      return data.banners;
    },
    staleTime: 60_000,
  });
}

export function useCreateBanner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { body: string; severity: BannerSeverity; enabled: boolean }) => {
      const { data } = await apiClient.post<HomeBanner>("/home-banners", input);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateBanner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; body: string; severity: BannerSeverity; enabled: boolean }) => {
      const { id, ...payload } = input;
      const { data } = await apiClient.put<HomeBanner>(`/home-banners/${id}`, payload);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteBanner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/home-banners/${id}`);
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
