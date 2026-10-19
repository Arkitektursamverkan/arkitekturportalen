import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";

export type GapTaskStatus = "todo" | "in_progress" | "done" | "cancelled";

export interface GapTask {
  id: string;
  gap_item_id: string;
  title: string;
  description: string;
  status: GapTaskStatus;
  assigned_to: string;
  due_date: string | null;
  horizon: string;
  weight: number;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  completed_at: string | null;
}

export interface GapTaskItemSummary {
  total: number;
  todo: number;
  in_progress: number;
  done: number;
  cancelled: number;
  weight_active: number;
  weight_done: number;
  weight_in_progress: number;
  last_activity: string | null;
}

export interface GapTaskSummary {
  by_item: Record<string, GapTaskItemSummary>;
}

/** Omfattning: how far a task moves its GAP item towards the target. */
export const TASK_WEIGHT_LABELS: Record<number, string> = { 1: "Liten", 2: "Medel", 3: "Stor" };

/**
 * How far a GAP item has come, as fractions 0–1 of the way to the target.
 * An item marked "Uppfyller målbilden" is done; otherwise completed task
 * weight over active (non-cancelled) task weight. `inProgress` is the share
 * that is under way, drawn ahead of the bar but not counted as done.
 */
export function gapItemProgress(
  gapTyp: string,
  s: Pick<GapTaskItemSummary, "weight_active" | "weight_done" | "weight_in_progress"> | undefined,
): { done: number; inProgress: number } {
  if (gapTyp === "uppfyller_malbild") return { done: 1, inProgress: 0 };
  if (!s || s.weight_active === 0) return { done: 0, inProgress: 0 };
  return { done: s.weight_done / s.weight_active, inProgress: s.weight_in_progress / s.weight_active };
}

/** A status change on a GAP item (task_id null → gap_typ) or one of its tasks. */
export interface GapStatusLogEntry {
  id: string;
  gap_item_id: string;
  task_id: string | null;
  task_title: string | null;
  from_status: string;
  to_status: string;
  comment: string;
  created_at: string;
  created_by: string | null;
}

const KEYS = {
  list: (gap_item_id: string) => ["gap-tasks", gap_item_id] as const,
  summary: () => ["gap-tasks", "summary"] as const,
  statusLog: (gap_item_id: string) => ["gap-status-log", gap_item_id] as const,
};

export function useGapStatusLog(gap_item_id: string) {
  return useQuery({
    queryKey: KEYS.statusLog(gap_item_id),
    queryFn: async () => {
      const { data } = await apiClient.get<GapStatusLogEntry[]>("/gap-tasks/status-log", { params: { gap_item_id } });
      return data;
    },
  });
}

export function useCreateGapStatusLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { gap_item_id: string; from_status: string; to_status: string; comment: string }) => {
      const { data } = await apiClient.post<GapStatusLogEntry>("/gap-tasks/status-log", input);
      return data;
    },
    onSuccess: (entry) => {
      qc.invalidateQueries({ queryKey: KEYS.statusLog(entry.gap_item_id) });
    },
  });
}

export function useGapTasks(gap_item_id: string) {
  return useQuery({
    queryKey: KEYS.list(gap_item_id),
    queryFn: async () => {
      const { data } = await apiClient.get<GapTask[]>("/gap-tasks", { params: { gap_item_id } });
      return data;
    },
  });
}

export function useGapTasksSummary() {
  return useQuery({
    queryKey: KEYS.summary(),
    queryFn: async () => {
      const { data } = await apiClient.get<GapTaskSummary>("/gap-tasks/summary");
      return data;
    },
    staleTime: 60_000,
  });
}

export function useCreateGapTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { gap_item_id: string; title: string; description?: string; assigned_to?: string; due_date?: string | null; horizon?: string; weight?: number }) => {
      const { data } = await apiClient.post<GapTask>("/gap-tasks", input);
      return data;
    },
    onSuccess: (task) => {
      qc.invalidateQueries({ queryKey: KEYS.list(task.gap_item_id) });
      qc.invalidateQueries({ queryKey: KEYS.summary() });
    },
  });
}

export function useUpdateGapTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; title?: string; description?: string; status?: GapTaskStatus; assigned_to?: string; due_date?: string | null; horizon?: string; weight?: number; status_comment?: string }) => {
      const { data } = await apiClient.patch<GapTask>(`/gap-tasks/${id}`, updates);
      return data;
    },
    onSuccess: (task) => {
      qc.invalidateQueries({ queryKey: KEYS.list(task.gap_item_id) });
      qc.invalidateQueries({ queryKey: KEYS.summary() });
      qc.invalidateQueries({ queryKey: KEYS.statusLog(task.gap_item_id) });
    },
  });
}

export function useDeleteGapTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, gap_item_id }: { id: string; gap_item_id: string }) => {
      await apiClient.delete(`/gap-tasks/${id}`);
      return gap_item_id;
    },
    onSuccess: (gap_item_id) => {
      qc.invalidateQueries({ queryKey: KEYS.list(gap_item_id) });
      qc.invalidateQueries({ queryKey: KEYS.summary() });
    },
  });
}
