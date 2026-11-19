import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";

/**
 * An installation's own reports: content loaded as data, shown by a generic
 * report kind. The server only lists the reports the user may see.
 */
export interface CustomReportMeta {
  key: string;
  title: string;
  description: string;
  kind: "kopplingsforslag";
  admin_only: boolean;
  antal: number;
  obeslutade: number;
  updated_at: string;
  updated_by: string | null;
}

export interface ProposalObject {
  id: string;
  name: string;
  type: string;
}

/** One suggested connection, with what is needed to read and decide on it. */
export interface ProposalRow {
  id: string;
  source_id: string;
  target_id: string;
  edge_type: string;
  grupp: string;
  säkerhet: string;
  motivering: string;
  /** null when the object no longer exists. */
  source: ProposalObject | null;
  target: ProposalObject | null;
  /** The suggested connection exists right now – whoever made it. */
  finns: boolean;
  beslut?: { val: "koppla" | "avstå"; av: string | null; när: string; edge_id?: string };
}

export interface CustomReport extends CustomReportMeta {
  rows: ProposalRow[];
}

export interface DecisionResult extends CustomReport {
  skapade: number;
  fel: Array<{ id: string; fel: string }>;
}

const KEYS = {
  list: ["custom-reports"] as const,
  item: (key: string) => ["custom-reports", key] as const,
};

export function useCustomReports(enabled = true) {
  return useQuery({
    queryKey: KEYS.list,
    enabled,
    queryFn: async () => {
      const { data } = await apiClient.get<{ reports: CustomReportMeta[] }>("/custom-reports");
      return data.reports;
    },
    staleTime: 60_000,
  });
}

export function useCustomReport(key: string | undefined) {
  return useQuery({
    queryKey: KEYS.item(key ?? ""),
    enabled: Boolean(key),
    queryFn: async () => {
      const { data } = await apiClient.get<CustomReport>(`/custom-reports/${key}`);
      return data;
    },
    staleTime: 0,
  });
}

/** Decide on rows: "koppla" creates the connection, null takes a decision back. */
export function useDecide(key: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ rowIds, val }: { rowIds: string[]; val: "koppla" | "avstå" | null }) => {
      const { data } = await apiClient.post<DecisionResult>(`/custom-reports/${key}/beslut`, {
        row_ids: rowIds,
        val,
      });
      return data;
    },
    onSuccess: (data) => {
      const { skapade: _skapade, fel: _fel, ...report } = data;
      qc.setQueryData(KEYS.item(key), report);
      qc.invalidateQueries({ queryKey: KEYS.list });
      // New connections show in every graph and list.
      qc.invalidateQueries({ queryKey: ["edges"] });
    },
  });
}
