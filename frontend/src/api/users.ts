import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";

export type UserRole = "user" | "superuser" | "admin";

export interface AppUser {
  id: string;
  entra_oid: string | null;
  name: string;
  email: string;
  role: UserRole | "system";
  is_local: boolean;
  is_provisioned: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface LocalUserCreate {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface ProvisionSource {
  node_id: string;
  node_name: string;
  node_type: string;
  attribute_key: string;
}

export interface ProvisionCandidate {
  name: string;
  suggested_email: string;
  email_is_guessed: boolean;
  roles: string[];
  sources: ProvisionSource[];
  existing_user_id: string | null;
}

export interface ProvisionUserIn {
  name: string;
  email: string;
  role?: UserRole;
}

export interface ProvisionResult {
  created: AppUser[];
  skipped: { email: string; reason: string }[];
}

export const userKeys = {
  all: ["users"] as const,
  list: () => [...userKeys.all, "list"] as const,
  provisionCandidates: (attributeKeys: string[]) =>
    [...userKeys.all, "provision-candidates", attributeKeys.join(",")] as const,
};

export function useUsers() {
  return useQuery({
    queryKey: userKeys.list(),
    queryFn: async () => {
      const { data } = await apiClient.get<AppUser[]>("/users");
      return data;
    },
  });
}

export function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) =>
      apiClient.patch<AppUser>(`/users/${id}`, { role }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useCreateLocalUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: LocalUserCreate) =>
      apiClient.post<AppUser>("/users", payload).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useProvisionCandidates(attributeKeys: string[], enabled: boolean) {
  return useQuery({
    queryKey: userKeys.provisionCandidates(attributeKeys),
    queryFn: async () => {
      const { data } = await apiClient.get<ProvisionCandidate[]>("/users/provision-candidates", {
        params: { attribute_keys: attributeKeys.join(",") },
      });
      return data;
    },
    enabled,
  });
}

export function useProvisionUsers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (users: ProvisionUserIn[]) =>
      apiClient.post<ProvisionResult>("/users/provision", { users }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      apiClient.post<AppUser>(`/users/${id}/password`, { password }).then((r) => r.data),
  });
}
