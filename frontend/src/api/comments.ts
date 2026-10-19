import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";

export type CommentSubjectType = "principle" | "target_architecture" | "glossary_term" | "nulaagesanalys" | "gap_analys";
export type CommentStatus = "pending" | "approved" | "rejected";

export interface Comment {
  id: string;
  subject_type: CommentSubjectType;
  subject_id: string;
  body: string;
  status: CommentStatus;
  created_at: string;
  created_by: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  reply: string | null;
}

const KEYS = {
  list: (subject_type: CommentSubjectType, subject_id: string) =>
    ["comments", subject_type, subject_id] as const,
};

export function useComments(subject_type: CommentSubjectType, subject_id: string) {
  return useQuery({
    queryKey: KEYS.list(subject_type, subject_id),
    queryFn: async () => {
      const { data } = await apiClient.get<Comment[]>("/comments", {
        params: { subject_type, subject_id },
      });
      return data;
    },
  });
}

export function useCreateComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { subject_type: CommentSubjectType; subject_id: string; body: string }) => {
      const { data } = await apiClient.post<Comment>("/comments", input);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: KEYS.list(data.subject_type, data.subject_id) });
    },
  });
}

export function useReviewComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, reply }: { id: string; status: "approved" | "rejected"; reply?: string }) => {
      const { data } = await apiClient.patch<Comment>(`/comments/${id}/review`, { status, reply });
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: KEYS.list(data.subject_type, data.subject_id) });
    },
  });
}

export function useDeleteComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; subject_type: CommentSubjectType; subject_id: string }) => {
      await apiClient.delete(`/comments/${input.id}`);
      return input;
    },
    onSuccess: (input) => {
      qc.invalidateQueries({ queryKey: KEYS.list(input.subject_type, input.subject_id) });
    },
  });
}
