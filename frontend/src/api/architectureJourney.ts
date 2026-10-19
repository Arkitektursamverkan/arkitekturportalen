import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import { useModules } from "./orgSettings";

export interface JourneyDocumentStatus {
  document_type: string;
  revised_at: string | null;
  revised_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
}

export interface JourneyStatusResponse {
  documents: Record<string, JourneyDocumentStatus>;
}

const STAMPS_KEY = ["architecture-journey", "stamps"] as const;

export function useJourneyStamps() {
  return useQuery({
    queryKey: STAMPS_KEY,
    queryFn: async () => {
      const { data } = await apiClient.get<JourneyStatusResponse>(
        "/architecture-journey/stamps",
      );
      return data;
    },
    staleTime: 30_000,
  });
}

export function useApproveDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      docType,
      approvedBy,
      approvedAt,
    }: {
      docType: string;
      approvedBy: string;
      approvedAt?: string;
    }) => {
      const { data } = await apiClient.put<JourneyDocumentStatus>(
        `/architecture-journey/stamps/${docType}/approve`,
        { approved_by: approvedBy, approved_at: approvedAt ?? null },
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: STAMPS_KEY }),
  });
}

export function useUpdateStampDates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      docType,
      approvedAt,
      revisedAt,
    }: {
      docType: string;
      approvedAt?: string;
      revisedAt?: string;
    }) => {
      const body: Record<string, string> = {};
      if (approvedAt !== undefined) body.approved_at = approvedAt;
      if (revisedAt !== undefined) body.revised_at = revisedAt;
      const { data } = await apiClient.patch<JourneyDocumentStatus>(
        `/architecture-journey/stamps/${docType}/dates`,
        body,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: STAMPS_KEY }),
  });
}

export function useClearApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (docType: string) => {
      const { data } = await apiClient.delete<JourneyDocumentStatus>(
        `/architecture-journey/stamps/${docType}/approve`,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: STAMPS_KEY }),
  });
}

// ── The journey's steps ────────────────────────────────────────────────────

export type JourneyDocument = "nulaagesanalys" | "target_architecture" | "gap_analys" | "principles";
export type JourneyIcon =
  | "assessment" | "flag" | "analytics" | "gavel" | "route" | "account_tree" | "storage" | "description"
  | "memory" | "groups" | "menu_book" | "calendar" | "checklist" | "lightbulb";

export interface JourneyStep {
  id: string;
  title: string;
  subtitle: string;
  body: string;
  icon: JourneyIcon;
  /** A page in the portal; the step is hidden while its module is off. */
  link_path: string | null;
  link_label: string;
  /** Shows Fastslaget/Reviderat for this document. */
  document: JourneyDocument | null;
}

export interface JourneyContent {
  title: string;
  intro: string;
  steps: JourneyStep[];
}

export interface JourneyRead {
  content: JourneyContent;
  is_default: boolean;
  updated_at: string | null;
  updated_by: string | null;
}

const JOURNEY_KEY = ["architecture-journey", "content"] as const;

export function useJourney() {
  return useQuery({
    queryKey: JOURNEY_KEY,
    queryFn: async () => (await apiClient.get<JourneyRead>("/architecture-journey")).data,
  });
}

export function useSaveJourney() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (content: JourneyContent | null) =>
      content === null
        ? (await apiClient.delete<JourneyRead>("/architecture-journey")).data
        : (await apiClient.put<JourneyRead>("/architecture-journey", content)).data,
    onSuccess: (data) => qc.setQueryData(JOURNEY_KEY, data),
  });
}

/** A step is shown when its page and its document are both available (the
 * documents belong to Arkitekturstyrning). */
export function useStepVisible() {
  const { pathEnabled, enabled } = useModules();
  return (s: JourneyStep) =>
    (!s.link_path || pathEnabled(s.link_path)) && (!s.document || enabled("governance"));
}

/** Title and visible steps, for the Home teaser. */
export function useVisibleJourney() {
  const { data } = useJourney();
  const visible = useStepVisible();
  return data ? { title: data.content.title, steps: data.content.steps.filter(visible) } : null;
}
