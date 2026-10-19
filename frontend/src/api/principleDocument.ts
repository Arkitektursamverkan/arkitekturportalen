import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import { triggerDownload, type DocumentVersionList } from "./targetArchitecture";

export interface PrincipleDocumentSections {
  introduction: string;
  decision_forum: string;
  deviation_handling: string;
  target_arch_alignment: string;
}

export type PrincipleDocumentSectionKey = keyof PrincipleDocumentSections;

export interface PrincipleDocument {
  id: string;
  sections: PrincipleDocumentSections;
  updated_at: string;
}

export const principleDocumentKeys = {
  all: ["principle-document"] as const,
};

export function usePrincipleDocument() {
  return useQuery({
    queryKey: principleDocumentKeys.all,
    queryFn: async () => {
      const { data } = await apiClient.get<PrincipleDocument>("/principle-document");
      return data;
    },
  });
}

export function useUpdatePrincipleDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<PrincipleDocumentSections> & { change_note?: string }) =>
      apiClient.patch<PrincipleDocument>("/principle-document", payload).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: principleDocumentKeys.all }),
  });
}

const PRINCIPLE_VERSIONS_KEY = ["principle-document", "versions"] as const;

export function usePrincipleDocumentVersions() {
  return useQuery({
    queryKey: PRINCIPLE_VERSIONS_KEY,
    queryFn: async () => {
      const { data } = await apiClient.get<DocumentVersionList>("/principle-document/versions");
      return data;
    },
    staleTime: 30_000,
  });
}

export async function downloadPrincipleDocumentPdf(
  opts: { bump?: "major" | "minor"; changeNote?: string; statuses?: string[]; approved?: boolean } = {},
): Promise<void> {
  const params = new URLSearchParams();
  if (opts.bump) params.append("bump", opts.bump);
  if (opts.changeNote && opts.changeNote.trim()) params.append("change_note", opts.changeNote.trim());
  if (opts.statuses && opts.statuses.length > 0) {
    for (const s of opts.statuses) params.append("status", s);
  }
  if (opts.approved) params.append("approved", "true");
  const response = await apiClient.get("/principle-document/export", {
    params,
    responseType: "blob",
  });
  const cd = response.headers["content-disposition"] as string | undefined;
  const match = cd?.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : "Arkitekturprinciper.pdf";
  triggerDownload(response.data as Blob, filename);
}

export async function downloadPrincipleDocumentVersionPdf(versionId: string): Promise<void> {
  const response = await apiClient.get(`/principle-document/versions/${versionId}/export`, {
    responseType: "blob",
  });
  const cd = response.headers["content-disposition"] as string | undefined;
  const match = cd?.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : "Arkitekturprinciper.pdf";
  triggerDownload(response.data as Blob, filename);
}
