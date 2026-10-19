import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import { triggerDownload } from "./targetArchitecture";
import type { SurveyReport } from "./surveys";

/**
 * A published report is one edition of a survey report, frozen when it was
 * published. Publishing the same report again adds an edition — it never
 * overwrites the previous one.
 */
export interface PublishedReportSummary {
  id: string;
  survey_id: string | null;
  survey_title: string;
  report_number: number;
  name: string;
  published_at: string;
  published_by: string | null;
  row_count: number;
  matching_count: number;
  answered_count: number;
}

export interface PublishedReportRead extends PublishedReportSummary {
  payload: SurveyReport;
}

const KEYS = {
  list: ["published-reports"] as const,
  item: (id: string) => ["published-reports", id] as const,
};

export function usePublishedReports(enabled = true) {
  return useQuery({
    queryKey: KEYS.list,
    enabled,
    queryFn: async () => {
      const { data } = await apiClient.get<PublishedReportSummary[]>("/published-reports");
      return data;
    },
  });
}

export function usePublishedReport(id: string | undefined) {
  return useQuery({
    queryKey: id ? KEYS.item(id) : ["published-reports", "none"],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data } = await apiClient.get<PublishedReportRead>(`/published-reports/${id}`);
      return data;
    },
  });
}

export function usePublishReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ surveyId, number, name }: {
      surveyId: string;
      number: number;
      name?: string;
    }) => {
      const { data } = await apiClient.post<PublishedReportSummary>(
        `/surveys/${surveyId}/reports/${number}/publish`,
        { name: name ?? null },
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list }),
  });
}

export function useDeletePublishedReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/published-reports/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list }),
  });
}

export async function downloadPublishedReport(id: string, format: "csv" | "pdf"): Promise<void> {
  const response = await apiClient.get(`/published-reports/${id}/export`, {
    params: { format },
    responseType: "blob",
  });
  const cd = response.headers["content-disposition"] as string | undefined;
  const match = cd?.match(/filename="([^"]+)"/);
  triggerDownload(response.data as Blob, match ? match[1] : `rapport.${format}`);
}

/** "2026-08-25" — the date a published edition is filed under. */
export function publishedDate(published_at: string): string {
  return new Date(published_at).toLocaleDateString("sv-SE");
}
