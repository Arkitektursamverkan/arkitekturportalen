import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import { triggerDownload } from "./targetArchitecture";

// paused: no new distribution (no launches, no random-survey offers), but
// already-launched recipients can still answer — unlike closed.
export type SurveyStatus = "draft" | "open" | "paused" | "closed";
// standard: resolved recipients + launch. random_system: logged-in users are
// offered a randomly picked system to answer about ("slumpenkät").
export type SurveyKind = "standard" | "random_system";
export type QuestionType = "text" | "yes_no" | "multiple_choice" | "system_picker" | "rating" | "rating_matrix";
export type MatchStatus = "matched" | "ambiguous" | "unmatched" | "manual" | "random";
export type ResponseStatus = "draft" | "pending" | "submitted" | "reviewed";
export type BranchOp = "eq" | "gte" | "lte";

export interface BranchRule {
  op?: BranchOp;
  value: unknown;
  goto: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  label: string;
  help_text?: string | null;
  required: boolean;
  options?: string[] | null;
  allow_multiple?: boolean | null;
  node_type_filter?: string | null;
  // rating_matrix: parameters each rated on the shared scale below;
  // the answer is {row label: chosen value}
  rows?: string[] | null;
  // rating (and the scale shared by rating_matrix)
  scale_min?: number | null;
  scale_max?: number | null;
  scale_min_label?: string | null;
  scale_max_label?: string | null;
  scale_min_emoji?: string | null;
  scale_max_emoji?: string | null;
  // branching
  branches?: BranchRule[] | null;
  default_goto?: string | null;
  // Report slots this question's answers are compiled into. Optional, and
  // editable after publication — it describes reporting, not what was asked.
  reports?: number[] | null;
}

// Fixed, numbered report slots. Mirrors REPORT_SLOTS in schemas/survey.py.
export const REPORT_SLOTS = [1, 2, 3, 4, 5] as const;
export type ReportOp = "eq" | "gte" | "lte" | "answered";
// Operator to the condition above. "and" binds tighter than "or", so
// A and B or C reads as (A and B) or C. Ignored on the first condition.
export type ReportJoin = "and" | "or";

export interface ReportCondition {
  question_id: string;
  op: ReportOp;
  value: unknown;
  join?: ReportJoin;
}

export interface ReportDefinition {
  number: number;
  name: string;
  conditions: ReportCondition[];
  // Leave out who answered. On by default, including for reports saved
  // before the flag existed.
  anonymous?: boolean;
}

export interface SurveyReportSummary {
  number: number;
  name: string;
  question_count: number;
  matching_count: number;
}

export interface SurveyReportRow {
  response_id: string;
  object_name: string;
  recipient: string;
  submitted_by: string;
  submitted_at: string;
  answers: Record<string, string>;
}

export interface SurveyReport {
  number: number;
  name: string;
  anonymous: boolean;
  survey_id: string;
  survey_title: string;
  generated_at: string;
  conditions: string[];
  questions: { id: string; label: string; type: QuestionType }[];
  rows: SurveyReportRow[];
  answered_count: number;
  matching_count: number;
}

export interface SurveySummary {
  id: string;
  title: string;
  status: SurveyStatus;
  kind: SurveyKind;
  due_date: string | null;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface SurveyRead extends SurveySummary {
  description: string;
  target_node_type: string;
  target_attribute_key: string;
  questions: Question[];
  reports: ReportDefinition[];
  allow_multiple_responses: boolean;
  include_decommissioned: boolean;
  /** Answered in another app instead of the built-in form; null = the form. */
  answer_url: string | null;
  created_at: string;
}

export interface SurveyResponseSummary {
  id: string;
  survey_id: string;
  survey_title: string;
  survey_status: SurveyStatus;
  survey_kind: SurveyKind;
  survey_due_date: string | null;
  /** Set when the survey is answered in another app instead of the form. */
  survey_answer_url?: string | null;
  allow_multiple_responses: boolean;
  node_id: string | null;
  node_name: string | null;
  raw_target_value: string | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  assigned_user_email: string | null;
  match_status: MatchStatus;
  status: ResponseStatus;
  answers: Record<string, string | boolean | number | string[] | Record<string, number>>;
  token: string;
  submitted_at: string | null;
  submitted_by: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  updated_at: string;
}

const KEYS = {
  list: ["surveys"] as const,
  item: (id: string) => ["surveys", id] as const,
  responses: (id: string) => ["surveys", id, "responses"] as const,
  reports: (id: string) => ["surveys", id, "reports"] as const,
  report: (id: string, number: number) => ["surveys", id, "reports", number] as const,
};

export function useSurveys(status?: SurveyStatus) {
  return useQuery({
    queryKey: [...KEYS.list, status ?? "all"],
    queryFn: async () => {
      const { data } = await apiClient.get<SurveySummary[]>("/surveys", {
        params: status ? { status } : undefined,
      });
      return data;
    },
  });
}

export function useSurvey(id: string | undefined) {
  return useQuery({
    queryKey: id ? KEYS.item(id) : ["surveys", "none"],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data } = await apiClient.get<SurveyRead>(`/surveys/${id}`);
      return data;
    },
  });
}

export function useCreateSurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      description?: string;
      kind?: SurveyKind;
      target_node_type?: string;
      target_attribute_key?: string;
      questions?: Question[];
      allow_multiple_responses?: boolean;
      due_date?: string | null;
      include_decommissioned?: boolean;
      answer_url?: string | null;
    }) => {
      const { data } = await apiClient.post<SurveyRead>("/surveys", input);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list }),
  });
}

// Copies title/description/target/questions/settings into a brand-new draft
// survey with no recipients — resolving recipients is a separate, explicit
// step the admin takes on the new survey when they're ready.
export function useDuplicateSurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: source } = await apiClient.get<SurveyRead>(`/surveys/${id}`);
      const { data } = await apiClient.post<SurveyRead>("/surveys", {
        title: `${source.title} (kopia)`,
        description: source.description,
        kind: source.kind,
        target_node_type: source.target_node_type,
        target_attribute_key: source.target_attribute_key,
        questions: source.questions,
        reports: source.reports,
        allow_multiple_responses: source.allow_multiple_responses,
        due_date: source.due_date,
        include_decommissioned: source.include_decommissioned,
        answer_url: source.answer_url,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list }),
  });
}

export function useUpdateSurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: { id: string } & Partial<Pick<SurveyRead, "title" | "description" | "questions" | "reports" | "status" | "target_node_type" | "target_attribute_key" | "allow_multiple_responses" | "due_date" | "include_decommissioned" | "answer_url">>) => {
      const { data } = await apiClient.patch<SurveyRead>(`/surveys/${id}`, patch);
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(KEYS.item(data.id), data);
      qc.invalidateQueries({ queryKey: KEYS.list });
      qc.invalidateQueries({ queryKey: KEYS.reports(data.id) });
    },
  });
}

export function useDeleteSurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/surveys/${id}`);
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list }),
  });
}

export function useResolveRecipients(surveyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<SurveyResponseSummary[]>(
        `/surveys/${surveyId}/resolve-recipients`,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.responses(surveyId) }),
  });
}

// Adds a recipient directly — optionally mapped to a specific object (e.g.
// a process), or with no object at all for a general send-out.
export function useAddManualRecipient(surveyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, nodeId }: { userId: string; nodeId?: string | null }) => {
      const { data } = await apiClient.post<SurveyResponseSummary>(
        `/surveys/${surveyId}/responses/manual`,
        { user_id: userId, node_id: nodeId ?? null },
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.responses(surveyId) }),
  });
}

export function useSurveyResponses(surveyId: string | undefined) {
  return useQuery({
    queryKey: surveyId ? KEYS.responses(surveyId) : ["surveys", "none", "responses"],
    enabled: Boolean(surveyId),
    queryFn: async () => {
      const { data } = await apiClient.get<SurveyResponseSummary[]>(`/surveys/${surveyId}/responses`);
      return data;
    },
  });
}

/** Report slots in use on a survey, with how many answers each one covers. */
export function useSurveyReports(surveyId: string | undefined) {
  return useQuery({
    queryKey: surveyId ? KEYS.reports(surveyId) : ["surveys", "none", "reports"],
    enabled: Boolean(surveyId),
    queryFn: async () => {
      const { data } = await apiClient.get<SurveyReportSummary[]>(`/surveys/${surveyId}/reports`);
      return data;
    },
  });
}

export function useSurveyReport(surveyId: string | undefined, number: number | undefined) {
  return useQuery({
    queryKey: surveyId && number ? KEYS.report(surveyId, number) : ["surveys", "none", "report"],
    enabled: Boolean(surveyId && number),
    queryFn: async () => {
      const { data } = await apiClient.get<SurveyReport>(`/surveys/${surveyId}/reports/${number}`);
      return data;
    },
  });
}

export async function downloadSurveyReport(
  surveyId: string,
  number: number,
  format: "csv" | "pdf",
): Promise<void> {
  const response = await apiClient.get(`/surveys/${surveyId}/reports/${number}/export`, {
    params: { format },
    responseType: "blob",
  });
  const cd = response.headers["content-disposition"] as string | undefined;
  const match = cd?.match(/filename="([^"]+)"/);
  triggerDownload(response.data as Blob, match ? match[1] : `rapport.${format}`);
}

/** Download the answered responses as a CSV (semicolon-separated, opens in Excel). */
export async function downloadSurveyResponsesCsv(surveyId: string): Promise<void> {
  const response = await apiClient.get(`/surveys/${surveyId}/responses/export`, {
    responseType: "blob",
  });
  const cd = response.headers["content-disposition"] as string | undefined;
  const match = cd?.match(/filename="([^"]+)"/);
  triggerDownload(response.data as Blob, match ? match[1] : "enkatsvar.csv");
}

export function useAssignResponseUser(surveyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ responseId, userId }: { responseId: string; userId: string }) => {
      const { data } = await apiClient.patch<SurveyResponseSummary>(
        `/surveys/${surveyId}/responses/${responseId}/assign`,
        { user_id: userId },
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.responses(surveyId) }),
  });
}

export function useDeleteResponse(surveyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (responseId: string) => {
      await apiClient.delete(`/surveys/${surveyId}/responses/${responseId}`);
      return responseId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.responses(surveyId) }),
  });
}

export function useReviewResponse(surveyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (responseId: string) => {
      const { data } = await apiClient.patch<SurveyResponseSummary>(
        `/surveys/${surveyId}/responses/${responseId}/review`,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.responses(surveyId) }),
  });
}

export function useLaunchSurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ surveyId, responseIds }: { surveyId: string; responseIds?: string[] }) => {
      const { data } = await apiClient.post<{ launched: number; skipped_unassigned: number }>(
        `/surveys/${surveyId}/launch`,
        { response_ids: responseIds ?? null },
      );
      return data;
    },
    onSuccess: (_data, { surveyId }) => {
      qc.invalidateQueries({ queryKey: KEYS.item(surveyId) });
      qc.invalidateQueries({ queryKey: KEYS.list });
      qc.invalidateQueries({ queryKey: KEYS.responses(surveyId) });
    },
  });
}

export function useCloseSurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (surveyId: string) => {
      const { data } = await apiClient.post<SurveyRead>(`/surveys/${surveyId}/close`);
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(KEYS.item(data.id), data);
      qc.invalidateQueries({ queryKey: KEYS.list });
    },
  });
}
