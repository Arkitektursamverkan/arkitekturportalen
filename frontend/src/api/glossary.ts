import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import { triggerDownload, type DocumentVersionList } from "./targetArchitecture";

export interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
  created_at: string;
  updated_at: string;
}

export interface GlossaryTermCreate {
  term: string;
  definition?: string;
}

export type GlossaryTermUpdate = Partial<GlossaryTermCreate>;

export const glossaryKeys = {
  all: ["glossary"] as const,
  list: () => [...glossaryKeys.all, "list"] as const,
  versions: () => [...glossaryKeys.all, "versions"] as const,
};

export function useGlossaryTerms() {
  return useQuery({
    queryKey: glossaryKeys.list(),
    queryFn: async () => {
      const { data } = await apiClient.get<GlossaryTerm[]>("/glossary");
      return data;
    },
  });
}

export function useCreateGlossaryTerm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: GlossaryTermCreate) =>
      apiClient.post<GlossaryTerm>("/glossary", payload).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: glossaryKeys.all }),
  });
}

export function useUpdateGlossaryTerm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: GlossaryTermUpdate & { id: string }) =>
      apiClient.patch<GlossaryTerm>(`/glossary/${id}`, payload).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: glossaryKeys.all }),
  });
}

export function useDeleteGlossaryTerm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/glossary/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: glossaryKeys.all }),
  });
}

export function useGlossaryVersions() {
  return useQuery({
    queryKey: glossaryKeys.versions(),
    queryFn: async () => {
      const { data } = await apiClient.get<DocumentVersionList>("/glossary/versions");
      return data;
    },
    staleTime: 30_000,
  });
}

export async function downloadGlossaryPdf(
  opts: { bump?: "major" | "minor"; changeNote?: string; approved?: boolean } = {},
): Promise<void> {
  const params = new URLSearchParams();
  if (opts.bump) params.append("bump", opts.bump);
  if (opts.changeNote && opts.changeNote.trim()) params.append("change_note", opts.changeNote.trim());
  if (opts.approved) params.append("approved", "true");
  const response = await apiClient.get("/glossary/export", {
    params,
    responseType: "blob",
  });
  const cd = response.headers["content-disposition"] as string | undefined;
  const match = cd?.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : "Ordlista.pdf";
  triggerDownload(response.data as Blob, filename);
}

export async function downloadGlossaryVersionPdf(versionId: string): Promise<void> {
  const response = await apiClient.get(`/glossary/versions/${versionId}/export`, {
    responseType: "blob",
  });
  const cd = response.headers["content-disposition"] as string | undefined;
  const match = cd?.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : "Ordlista.pdf";
  triggerDownload(response.data as Blob, filename);
}
