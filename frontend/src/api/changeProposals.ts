import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { apiClient } from "./client";
import { adminNotificationsKey } from "./adminNotifications";
import { ATTR_FIELDS } from "@/config/graphConfig";

/**
 * Ändringsförslag på ett domänobjekt.
 *
 * Vem som helst föreslår med pennan; förslaget skriver ALDRIG till objektet.
 * Värdet som visas är det bakomliggande listan levererat – så länge förslaget
 * är öppet stryks det över och förslaget står ovanför. Admin gör ändringen i
 * listan för hand och släcker förslaget; då försvinner överstrykningen och
 * objektet visar det synken läser in.
 */
export interface ChangeProposal {
  id: string;
  node_id: string;
  node_name: string;
  node_type: string;
  node_source: string;
  /** "name", "description" eller "attributes.<nyckel>" */
  field: string;
  old_value: string | null;
  new_value: string;
  /** Vad objektet visar NU – det listan senast levererade. */
  current_value: string | null;
  comment: string | null;
  proposed_by: string | null;
  proposed_by_id: string | null;
  status: "pending" | "done" | "rejected" | "withdrawn";
  created_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
}

export const changeProposalKeys = {
  all: ["change-proposals"] as const,
  byNode: (nodeId: string) => [...changeProposalKeys.all, "node", nodeId] as const,
};

export const attrField = (key: string) => `attributes.${key}`;

/** Läsbar rubrik för ett förslags fält, samma som i detaljpanelen. */
export function proposalFieldLabel(field: string, nodeType: string, t: TFunction | ((k: string) => string)): string {
  if (field === "name") return t("common.name");
  if (field === "description") return t("common.description");
  const key = field.startsWith("attributes.") ? field.slice("attributes.".length) : field;
  const defined = (ATTR_FIELDS as Record<string, { key: string; labelKey: string }[]>)[nodeType]?.find((f) => f.key === key);
  if (defined) return t(defined.labelKey);
  const attrKey = `attributes.${key.toLowerCase()}`;
  const translated = t(attrKey);
  return translated !== attrKey ? translated : key;
}

export function useNodeChangeProposals(nodeId: string | undefined) {
  return useQuery({
    queryKey: changeProposalKeys.byNode(nodeId ?? ""),
    queryFn: async () => {
      const { data } = await apiClient.get<ChangeProposal[]>(`/nodes/${nodeId}/change-proposals`);
      return data;
    },
    enabled: Boolean(nodeId),
    staleTime: 0,
  });
}

export function useCreateChangeProposals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ nodeId, changes, comment }: {
      nodeId: string;
      changes: { field: string; new_value: string }[];
      comment: string | null;
    }) =>
      apiClient
        .post<ChangeProposal[]>(`/nodes/${nodeId}/change-proposals`, { changes, comment })
        .then((r) => r.data),
    onSuccess: (_data, { nodeId }) => {
      qc.invalidateQueries({ queryKey: changeProposalKeys.byNode(nodeId) });
      qc.invalidateQueries({ queryKey: adminNotificationsKey });
    },
  });
}

export function useResolveChangeProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, outcome, note }: { id: string; nodeId: string; outcome: "done" | "rejected"; note: string | null }) =>
      apiClient.post<ChangeProposal>(`/change-proposals/${id}/resolve`, { outcome, note }).then((r) => r.data),
    onSuccess: (_data, { nodeId }) => {
      qc.invalidateQueries({ queryKey: changeProposalKeys.byNode(nodeId) });
      qc.invalidateQueries({ queryKey: adminNotificationsKey });
    },
  });
}

export function useWithdrawChangeProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; nodeId: string }) => apiClient.delete(`/change-proposals/${id}`),
    onSuccess: (_data, { nodeId }) => {
      qc.invalidateQueries({ queryKey: changeProposalKeys.byNode(nodeId) });
      qc.invalidateQueries({ queryKey: adminNotificationsKey });
    },
  });
}
