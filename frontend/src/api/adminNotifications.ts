import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import type { Comment } from "./comments";
import type { ChangeProposal } from "./changeProposals";
import type { CalendarEvent } from "./calendar";

export interface HelpRequestEntry {
  sketch_id: string;
  sketch_title: string;
  sketch_status: string;
  created_by: string | null;
  updated_at: string;
  fields: string[];
}

export interface GlossaryRequestEntry {
  id: string;
  term: string;
  context: string | null;
  requested_by: string | null;
  status: string;
  created_at: string;
}

export interface NodeDeletionEntry {
  id: string;
  node_id: string;
  node_name: string;
  node_type: string;
  reason: string;
  deleted_by: string;
  deleted_at: string;
}

export interface AdminNotifications {
  pending_comments: Comment[];
  help_requests: HelpRequestEntry[];
  glossary_requests: GlossaryRequestEntry[];
  node_deletions: NodeDeletionEntry[];
  change_proposals: ChangeProposal[];
  calendar_proposals: CalendarEvent[];
}

const KEY = ["admin", "notifications"] as const;

export function useAdminNotifications(enabled = true) {
  return useQuery({
    queryKey: KEY,
    enabled,
    queryFn: async () => {
      const { data } = await apiClient.get<AdminNotifications>("/admin/notifications");
      return data;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export const adminNotificationsKey = KEY;

export function useSubmitGlossaryRequest() {
  return useMutation({
    mutationFn: async ({ term, context }: { term: string; context?: string }) => {
      await apiClient.post("/glossary/requests", { term, context: context || null });
    },
  });
}

export function useFulfillGlossaryRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, term, definition }: { id: string; term: string; definition: string }) => {
      await apiClient.post(`/glossary/requests/${id}/fulfill`, { term, definition });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/**
 * Tar bort ETT borttagningsmeddelande ur inkorgen.
 *
 * De övriga fyra avdelningarna bär en status som granskaren kan flytta; den
 * här är en ren logg, så ingenting kunde någonsin kvittera den och räknaren
 * stod kvar på "1 öppet ärende att hantera" för alltid. Revisionsspåret rörs
 * inte – själva borttagningen ligger kvar i ea_audit_log med ögonblicksbild.
 */
export function useDismissNodeDeletion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/admin/notifications/node-deletions/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDismissGlossaryRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.post(`/glossary/requests/${id}/dismiss`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
