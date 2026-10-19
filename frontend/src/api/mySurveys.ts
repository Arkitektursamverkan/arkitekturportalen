import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import type { MatchStatus, Question, ResponseStatus, SurveyKind, SurveyStatus, SurveyResponseSummary } from "./surveys";

export type AnswerValue = string | boolean | string[] | number | Record<string, number>;
export type SurveyAnswers = Record<string, AnswerValue>;

export interface SurveyResponseRead {
  id: string;
  survey_id: string;
  survey_title: string;
  survey_description: string;
  survey_status: SurveyStatus;
  survey_kind: SurveyKind;
  survey_due_date: string | null;
  allow_multiple_responses: boolean;
  questions: Question[];
  node_id: string | null;
  node_name: string | null;
  assigned_user_id: string | null;
  match_status: MatchStatus;
  status: ResponseStatus;
  answers: SurveyAnswers;
  token: string;
  submitted_at: string | null;
  submitted_by: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

const KEYS = {
  list: ["my-surveys"] as const,
  item: (id: string) => ["my-surveys", id] as const,
  byToken: (token: string) => ["my-surveys", "token", token] as const,
};

export function useMySurveys(enabled = true) {
  return useQuery({
    queryKey: KEYS.list,
    enabled,
    queryFn: async () => {
      const { data } = await apiClient.get<SurveyResponseSummary[]>("/my-surveys");
      return data;
    },
  });
}

export function useMySurveyResponse(responseId: string | undefined) {
  return useQuery({
    queryKey: responseId ? KEYS.item(responseId) : ["my-surveys", "none"],
    enabled: Boolean(responseId),
    queryFn: async () => {
      const { data } = await apiClient.get<SurveyResponseRead>(`/my-surveys/${responseId}`);
      return data;
    },
  });
}

export function useResolveSurveyToken(token: string | undefined) {
  return useQuery({
    queryKey: token ? KEYS.byToken(token) : ["my-surveys", "token", "none"],
    enabled: Boolean(token),
    retry: false,
    queryFn: async () => {
      const { data } = await apiClient.get<SurveyResponseRead>(`/my-surveys/by-token/${token}`);
      return data;
    },
  });
}

/**
 * Login-session dice roll for the random-system survey ("slumpenkät").
 * Returns the response slot to offer the user, or null when nothing
 * triggered. Refreshes the my-surveys list when a slot is offered so it
 * shows up under Mina enkäter even if the user postpones.
 */
export function useRandomSurveyCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{ response: SurveyResponseSummary | null }>(
        "/my-surveys/random-check",
      );
      return data.response;
    },
    onSuccess: (response) => {
      if (response) qc.invalidateQueries({ queryKey: KEYS.list });
    },
  });
}

export function useSubmitAnswers(responseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (answers: SurveyAnswers) => {
      const { data } = await apiClient.post<SurveyResponseRead>(`/my-surveys/${responseId}/answers`, {
        answers,
      });
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(KEYS.item(data.id), data);
      qc.invalidateQueries({ queryKey: KEYS.list });
    },
  });
}
