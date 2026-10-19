import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";

export type PrincipleDomain = "Övergripande" | "Verksamhet" | "Information" | "Applikation" | "Teknik";
export type PrincipleStatus = "Förslag" | "Beslutad" | "Infört" | "Avvecklad";

export const PRINCIPLE_DOMAINS: PrincipleDomain[] = [
  "Övergripande",
  "Verksamhet",
  "Information",
  "Applikation",
  "Teknik",
];

export const PRINCIPLE_STATUSES: PrincipleStatus[] = ["Förslag", "Beslutad", "Infört", "Avvecklad"];

export interface Principle {
  id: string;
  identifier: string;
  domain: PrincipleDomain;
  name: string;
  purpose: string;
  not: string;
  but: string;
  means: string;
  status: PrincipleStatus;
  created_at: string;
  updated_at: string;
}

export interface PrincipleCreate {
  identifier: string;
  domain: PrincipleDomain;
  name: string;
  purpose?: string;
  not?: string;
  but?: string;
  means?: string;
  status?: PrincipleStatus;
}

export type PrincipleUpdate = Partial<PrincipleCreate>;

export const principleKeys = {
  all: ["principles"] as const,
  list: (filters?: { status?: PrincipleStatus; domain?: PrincipleDomain }) =>
    [...principleKeys.all, "list", filters] as const,
};

export function usePrinciples(
  filters?: { status?: PrincipleStatus; domain?: PrincipleDomain },
  enabled = true,
) {
  return useQuery({
    queryKey: principleKeys.list(filters),
    enabled,
    queryFn: async () => {
      const { data } = await apiClient.get<Principle[]>("/principles", { params: filters });
      return data;
    },
  });
}

export function useCreatePrinciple() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PrincipleCreate) =>
      apiClient.post<Principle>("/principles", payload).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: principleKeys.all }),
  });
}

export function useUpdatePrinciple() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: PrincipleUpdate & { id: string }) =>
      apiClient.patch<Principle>(`/principles/${id}`, payload).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: principleKeys.all }),
  });
}

export function useDeletePrinciple() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/principles/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: principleKeys.all }),
  });
}
