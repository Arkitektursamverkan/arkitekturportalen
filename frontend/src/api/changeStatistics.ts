import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiClient } from "./client";

export type ChangeKind = "added" | "updated" | "removed";

export interface ChangeEvent {
  at: string;
  kind: ChangeKind;
  node_id: string;
  name: string | null;
  type: string;
  /** NONE (entered in the portal), SHAREPOINT, 2C8, CSV … */
  source: string;
  by_sync: boolean;
  /** Who made the change – admins only. */
  by: string | null;
  /** For "updated": name, description, external_source, external_id or an attribute key. */
  fields: string[];
}

export interface ChangeStatistics {
  start: string;
  end: string;
  events: ChangeEvent[];
  truncated: boolean;
  /** Objects of each type at `end` (not archived), as far as the user may see. */
  count_at_end: Record<string, number>;
  /** The oldest change on record. */
  history_from: string | null;
}

/** Changes between `start` (inclusive) and `end` (exclusive) to the given types. */
export function useChangeStatistics(start: Date, end: Date, types: string[]) {
  const s = start.toISOString();
  const e = end.toISOString();
  return useQuery({
    queryKey: ["change-statistics", s, e, [...types].sort()],
    queryFn: async () => {
      // FastAPI reads a list as repeated keys (types=a&types=b).
      const params = new URLSearchParams({ start: s, end: e });
      types.forEach((t) => params.append("types", t));
      const { data } = await apiClient.get<ChangeStatistics>(`/change-statistics?${params}`);
      return data;
    },
    // A new period keeps the old charts on screen until the new data is in.
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}
