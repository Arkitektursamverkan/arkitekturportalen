import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";

export type DocumentTypeKey = "target_architecture" | "principle_document" | "glossary" | "nulaagesanalys" | "gap_analys";

export interface MetadataEntry {
  label: string;
  value: string;
}

export interface DocumentMetadata {
  document_type: DocumentTypeKey;
  entries: MetadataEntry[];
  updated_at: string;
  updated_by: string | null;
}

const KEY = (t: DocumentTypeKey) => ["document-metadata", t] as const;

export function useDocumentMetadata(documentType: DocumentTypeKey) {
  return useQuery({
    queryKey: KEY(documentType),
    queryFn: async () => {
      const { data } = await apiClient.get<DocumentMetadata>(`/document-metadata/${documentType}`);
      return data;
    },
    staleTime: 60_000,
  });
}

export function useUpdateDocumentMetadata(documentType: DocumentTypeKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entries: MetadataEntry[]) => {
      const { data } = await apiClient.put<DocumentMetadata>(
        `/document-metadata/${documentType}`,
        { entries },
      );
      return data;
    },
    onSuccess: (data) => qc.setQueryData(KEY(documentType), data),
  });
}
