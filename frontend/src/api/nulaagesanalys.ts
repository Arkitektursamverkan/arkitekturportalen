import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import { triggerDownload, type DocumentVersionList } from "./targetArchitecture";

export interface TextSection {
  id: string;
  title: string;
  body: string;
}

export interface NulaagesanalysContent {
  sections: TextSection[];
}

export interface NulaagesanalysRead {
  content: NulaagesanalysContent;
  updated_at: string;
  updated_by: string | null;
}

const KEY = ["nulaagesanalys"] as const;
const VERSIONS_KEY = ["nulaagesanalys", "versions"] as const;

export function useNulaagesanalys() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data } = await apiClient.get<NulaagesanalysRead>("/nulaagesanalys");
      return data;
    },
  });
}

export function useUpdateNulaagesanalys() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (content: NulaagesanalysContent) => {
      const { data } = await apiClient.put<NulaagesanalysRead>("/nulaagesanalys", content);
      return data;
    },
    onSuccess: (data) => qc.setQueryData(KEY, data),
  });
}

export function useNulaagesanalysVersions() {
  return useQuery({
    queryKey: VERSIONS_KEY,
    queryFn: async () => {
      const { data } = await apiClient.get<DocumentVersionList>("/nulaagesanalys/versions");
      return data;
    },
    staleTime: 30_000,
  });
}

export async function downloadNulaagesanalysPdf(
  opts: { bump?: "major" | "minor"; changeNote?: string; approved?: boolean } = {},
): Promise<void> {
  const params: Record<string, string> = {};
  if (opts.bump) params.bump = opts.bump;
  if (opts.changeNote && opts.changeNote.trim()) params.change_note = opts.changeNote.trim();
  if (opts.approved) params.approved = "true";
  const response = await apiClient.get("/nulaagesanalys/export", { params, responseType: "blob" });
  const cd = response.headers["content-disposition"] as string | undefined;
  const match = cd?.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : "Nulaagesanalys.pdf";
  triggerDownload(response.data as Blob, filename);
}

export async function downloadNulaagesanalysVersionPdf(versionId: string): Promise<void> {
  const response = await apiClient.get(`/nulaagesanalys/versions/${versionId}/export`, {
    responseType: "blob",
  });
  const cd = response.headers["content-disposition"] as string | undefined;
  const match = cd?.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : "Nulaagesanalys.pdf";
  triggerDownload(response.data as Blob, filename);
}

export function makeSectionId(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "section";
  return `text-${slug}-${Math.random().toString(36).slice(2, 7)}`;
}

