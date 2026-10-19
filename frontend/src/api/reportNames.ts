import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";

/**
 * A renamed report. Only renamed ones are listed — everything else goes by the
 * name in the locale files, and the rename shadows it in both languages.
 */
export interface ReportName {
  report_key: string;
  name: string;
}

const KEYS = {
  list: ["report-names"] as const,
};

export function useReportNames() {
  return useQuery({
    queryKey: KEYS.list,
    queryFn: async () => {
      const { data } = await apiClient.get<ReportName[]>("/report-names");
      return new Map(data.map((r) => [r.report_key, r.name]));
    },
    // Asked for on every page by the sidebar; changes rarely.
    staleTime: 5 * 60 * 1000,
  });
}

export function useRenameReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ reportKey, name }: { reportKey: string; name: string }) => {
      const { data } = await apiClient.put<ReportName>(
        `/report-names/${encodeURIComponent(reportKey)}`,
        { name },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.list });
      // A published edition is renamed in its own row, so its listing is stale too.
      qc.invalidateQueries({ queryKey: ["published-reports"] });
    },
  });
}

/** Give a built-in report its translated name back. */
export function useResetReportName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reportKey: string) => {
      await apiClient.delete(`/report-names/${encodeURIComponent(reportKey)}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list }),
  });
}
