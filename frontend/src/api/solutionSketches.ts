import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";

export type SketchStatus = "draft" | "in_review" | "approved" | "archived";

export interface SketchAnswers {
  business?: {
    need_summary?: string;
    process_ids?: string[];
    process_proposals?: string[];
    users_affected?: string;
    strategic_alignment?: string;
    complement_or_replace?: "complement" | "replace" | "new" | "";
  };
  information?: {
    data_inputs?: string;
    data_outputs?: string;
    owner?: string;
    personal_data?: boolean;
    classification?: "" | "Open" | "Internal" | "Confidential" | "Secret";
    info_object_ids?: string[];
    info_object_proposals?: string[];
    info_source_ids?: string[];
    info_source_proposals?: string[];
  };
  application?: {
    integrates_with_ids?: string[];
    integrates_with_proposals?: string[];
    ux_notes?: string;
    lifecycle_expected?: string;
    vendor_strategy?: string;
  };
  technology?: {
    hosting?: "" | "Cloud" | "OnPrem" | "Hybrid";
    auth_method?: "" | "SSO" | "SAML" | "Local" | "OIDC";
    mfa_required?: boolean;
    security_classification?: string;
    tech_component_ids?: string[];
    tech_component_proposals?: string[];
  };
  /** Field paths (e.g. "business.need_summary") for which the user has flagged "begär hjälp". */
  help_requests?: string[];
  /** Field paths the user has explicitly marked as not relevant for this sketch. */
  not_applicable?: string[];
}

export interface SketchSummary {
  id: string;
  title: string;
  status: SketchStatus;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface SketchRead extends SketchSummary {
  description: string;
  answers: SketchAnswers;
  created_at: string;
}

const KEYS = {
  list: ["solution-sketches"] as const,
  item: (id: string) => ["solution-sketches", id] as const,
};

export function useSolutionSketches() {
  return useQuery({
    queryKey: KEYS.list,
    queryFn: async () => {
      const { data } = await apiClient.get<SketchSummary[]>("/solution-sketches");
      return data;
    },
  });
}

export function useSolutionSketch(id: string | undefined) {
  return useQuery({
    queryKey: id ? KEYS.item(id) : ["solution-sketches", "none"],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data } = await apiClient.get<SketchRead>(`/solution-sketches/${id}`);
      return data;
    },
  });
}

export function useCreateSketch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { title: string; description?: string }) => {
      const { data } = await apiClient.post<SketchRead>("/solution-sketches", input);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list }),
  });
}

export function useUpdateSketch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<Pick<SketchRead, "title" | "description" | "status" | "answers">>) => {
      const { data } = await apiClient.patch<SketchRead>(`/solution-sketches/${id}`, patch);
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(KEYS.item(data.id), data);
      qc.invalidateQueries({ queryKey: KEYS.list });
    },
  });
}

export function useDeleteSketch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/solution-sketches/${id}`);
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list }),
  });
}
