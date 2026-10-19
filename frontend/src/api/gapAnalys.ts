import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import { triggerDownload, type DocumentVersionList } from "./targetArchitecture";

export type GapTyp = "saknas_helt" | "otillrackligt" | "ska_avvecklas" | "uppfyller_malbild";
export type Prioritet = "HOG" | "MELLAN" | "MINDRE" | "";

export interface GapItem {
  id: string;
  domain: string;
  objekt: string;
  nulaege: string;
  onskat_laege: string;
  gap_typ: GapTyp;
  konsekvens: string;
  atgard: string;
  ansvarig: string;
  deadline: string;
  prioritet: Prioritet;
}

export interface RekommendationSection {
  id: string;
  titel: string;
  body: string;
}

export interface HandlingsplanOmrade {
  id: string;
  nr: number;
  titel: string;
  ansvarig: string;
  aktiviteter_0_3: string;
  aktiviteter_3_6: string;
  aktiviteter_6_12: string;
}

export interface GapAnalysContent {
  items: GapItem[];
  rekommendationer: RekommendationSection[];
  handlingsplan: HandlingsplanOmrade[];
}

export interface GapAnalysRead {
  content: GapAnalysContent;
  updated_at: string;
  updated_by: string | null;
}

const KEY = ["gap-analys"] as const;
const VERSIONS_KEY = ["gap-analys", "versions"] as const;

export function useGapAnalys() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data } = await apiClient.get<GapAnalysRead>("/gap-analys");
      return data;
    },
  });
}

export function useUpdateGapAnalys() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (content: GapAnalysContent) => {
      const { data } = await apiClient.put<GapAnalysRead>("/gap-analys", content);
      return data;
    },
    onSuccess: (data) => qc.setQueryData(KEY, data),
  });
}

export function useGapAnalysVersions() {
  return useQuery({
    queryKey: VERSIONS_KEY,
    queryFn: async () => {
      const { data } = await apiClient.get<DocumentVersionList>("/gap-analys/versions");
      return data;
    },
    staleTime: 30_000,
  });
}

export async function downloadGapAnalysPdf(
  opts: { bump?: "major" | "minor"; changeNote?: string; approved?: boolean } = {},
): Promise<void> {
  const params: Record<string, string> = {};
  if (opts.bump) params.bump = opts.bump;
  if (opts.changeNote && opts.changeNote.trim()) params.change_note = opts.changeNote.trim();
  if (opts.approved) params.approved = "true";
  const response = await apiClient.get("/gap-analys/export", { params, responseType: "blob" });
  const cd = response.headers["content-disposition"] as string | undefined;
  const match = cd?.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : "GAP-analys.pdf";
  triggerDownload(response.data as Blob, filename);
}

export async function downloadGapAnalysVersionPdf(versionId: string): Promise<void> {
  const response = await apiClient.get(`/gap-analys/versions/${versionId}/export`, {
    responseType: "blob",
  });
  const cd = response.headers["content-disposition"] as string | undefined;
  const match = cd?.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : "GAP-analys.pdf";
  triggerDownload(response.data as Blob, filename);
}

export function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}
