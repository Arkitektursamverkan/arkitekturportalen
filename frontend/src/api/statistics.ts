import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "./client";

export interface DailyActivity {
  date: string;   // "2026-05-01"
  total: number;
  create: number;
  update: number;
  delete: number;
  login: number;
}

export interface EntityTypeStat {
  label: string;
  count: number;
}

export interface UsageStatistics {
  period_days: number;
  total_events: number;
  active_days: number;
  by_action: Record<string, number>;
  by_entity_type: EntityTypeStat[];
  activity_by_day: DailyActivity[];
}

export function useStatistics(periodDays: number) {
  return useQuery({
    queryKey: ["statistics", periodDays],
    queryFn: async () => {
      const { data } = await apiClient.get<UsageStatistics>("/statistics", {
        params: { period_days: periodDays },
      });
      return data;
    },
    staleTime: 60_000,
  });
}

export function useRecordSession() {
  return useMutation({
    mutationFn: () => apiClient.post("/statistics/session").then(() => undefined),
  });
}
