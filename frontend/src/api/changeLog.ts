import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";

/**
 * Förändringsloggen.
 *
 * Planerade och genomförda ändringar i IT-miljön, loggade från
 * verksamhetskalendern av IT- och Informationsarkitektur (och admin). Alla
 * inloggade läser. En förändring som krockar med en fastställd
 * verksamhetspost sparas bara om man aktivt valt att genomföra den ändå.
 *
 * Tider är lokal klocktid utan tidszon: "2026-11-02T10:00:00".
 */
export type AffectedShare = "none" | "lt25" | "25to50" | "50to75" | "gt75";
export type UserImpact = "none" | "low" | "medium" | "high";
export type ChangeType = "emergency" | "normal" | "standard";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export const AFFECTED_SHARE_LABELS: Record<AffectedShare, string> = {
  none: "0 %",
  lt25: "< 25 %",
  "25to50": "25–50 %",
  "50to75": "50–75 %",
  gt75: "> 75 %",
};
export const USER_IMPACT_LABELS: Record<UserImpact, string> = {
  none: "Ingen", low: "Liten", medium: "Medel", high: "Hög",
};
export const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
  emergency: "Akut", normal: "Normal", standard: "Standard",
};
export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: "Väntar på godkännande", approved: "Godkänd", rejected: "Ej godkänd",
};

/** En verksamhetspost som förändringen krockar med. */
export interface ChangeConflict {
  event_id: string;
  title: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  change_freeze: boolean;
  /** Objekt som både posten och förändringen pekar på. */
  shared_nodes: string[];
}

export interface ChangeEntry {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  affected_share: AffectedShare;
  user_impact: UserImpact;
  change_type: ChangeType;
  description: string;
  impact: string;
  risks: string;
  notify_departments: string[];
  approval_status: ApprovalStatus;
  approved_by: string;
  nodes: { id: string; name: string; type: string }[];
  /** Förändringen genomförs trots krock – ett aktivt val, med vem som gjorde det. */
  conflict_override: boolean;
  conflict_override_by: string | null;
  conflicts: ChangeConflict[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChangeEntryInput {
  title: string;
  starts_at: string;
  ends_at: string | null;
  affected_share: AffectedShare;
  user_impact: UserImpact;
  change_type: ChangeType;
  description: string;
  impact: string;
  risks: string;
  notify_departments: string[];
  approval_status: ApprovalStatus;
  approved_by: string;
  node_ids: string[];
  conflict_override: boolean;
}

export const changeLogKeys = {
  all: ["change-log"] as const,
  entries: (from?: string, to?: string) => ["change-log", "entries", from ?? "", to ?? ""] as const,
  permissions: ["change-log", "permissions"] as const,
};

/** "2 nov. 10:00" eller "2 nov. 10:00 – 12:00" / "2 nov. 22:00 – 3 nov. 02:00". */
export function changeWhenLabel(e: Pick<ChangeEntry, "starts_at" | "ends_at">): string {
  const day = (iso: string) =>
    new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" });
  const clock = (iso: string) => iso.slice(11, 16);
  const start = `${day(e.starts_at)} ${clock(e.starts_at)}`;
  if (!e.ends_at || e.ends_at === e.starts_at) return start;
  return e.ends_at.slice(0, 10) === e.starts_at.slice(0, 10)
    ? `${start} – ${clock(e.ends_at)}`
    : `${start} – ${day(e.ends_at)} ${clock(e.ends_at)}`;
}

export function useChangeLogPermissions() {
  return useQuery({
    queryKey: changeLogKeys.permissions,
    queryFn: async () => {
      const { data } = await apiClient.get<{ can_manage: boolean }>("/change-log/permissions");
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

/** Utan period: hela loggen, nyast först. */
export function useChangeEntries(from?: string, to?: string) {
  return useQuery({
    queryKey: changeLogKeys.entries(from, to),
    queryFn: async () => {
      const { data } = await apiClient.get<ChangeEntry[]>("/change-log/entries", {
        params: from && to ? { from, to } : undefined,
      });
      return data;
    },
    placeholderData: (prev) => prev,
  });
}

/** Vad en förändring vid den här tiden krockar med – frågas medan formuläret fylls i. */
export function useChangeConflicts(startsAt: string, endsAt: string | null, nodeIds: string[]) {
  return useQuery({
    queryKey: [...changeLogKeys.all, "conflicts", startsAt, endsAt ?? "", [...nodeIds].sort().join(",")],
    queryFn: async () => {
      const { data } = await apiClient.post<ChangeConflict[]>("/change-log/conflicts", {
        starts_at: startsAt, ends_at: endsAt, node_ids: nodeIds,
      });
      return data;
    },
    enabled: Boolean(startsAt) && (!endsAt || endsAt >= startsAt),
    placeholderData: (prev) => prev,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: changeLogKeys.all });
}

export function useSaveChangeEntry() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...input }: ChangeEntryInput & { id?: string }) =>
      (id
        ? apiClient.put<ChangeEntry>(`/change-log/entries/${id}`, input)
        : apiClient.post<ChangeEntry>("/change-log/entries", input)
      ).then((r) => r.data),
    onSuccess: invalidate,
  });
}

export function useDeleteChangeEntry() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/change-log/entries/${id}`),
    onSuccess: invalidate,
  });
}
