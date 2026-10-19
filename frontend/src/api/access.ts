import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import type { NodePermissions } from "./nodeContent";

// ── Types ───────────────────────────────────────────────────────────────────

export type Permission =
  | "object.read" | "object.edit"
  | "documents.read" | "documents.read_restricted" | "documents.write"
  | "notes.read" | "notes.write"
  | "content.manage";

export interface AccessMeta {
  permissions: Permission[];
  node_types: string[];
  principal_roles: string[];
}

export interface Role {
  id: string;
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
  builtin: boolean;
  sort_order: number;
  grant_count: number;
}

export interface UserBrief {
  id: string;
  name: string;
  email: string;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  members: UserBrief[];
}

export type PrincipalType = "everyone" | "role" | "group" | "user";
export type ScopeType = "all" | "types" | "node";

export interface Grant {
  id: string;
  principal_type: PrincipalType;
  principal_role: string | null;
  group_id: string | null;
  user_id: string | null;
  principal_name: string | null;
  role_id: string;
  role_key: string;
  role_name: string;
  permissions: Permission[];
  scope_type: ScopeType;
  node_types: string[];
  node_id: string | null;
  node_name: string | null;
  node_type: string | null;
  include_children: boolean;
  note: string;
  created_at: string;
  created_by: string | null;
}

export interface GrantCreate {
  principal_type: PrincipalType;
  principal_role?: string | null;
  group_id?: string | null;
  user_id?: string | null;
  role_id: string;
  scope_type: ScopeType;
  node_types?: string[];
  node_id?: string | null;
  include_children?: boolean;
  note?: string;
}

export interface GrantReach {
  grant: Grant;
  via: "all" | "type" | "node" | "inherited";
  inherited_from_id: string | null;
  inherited_from_name: string | null;
}

export interface NodeAccess {
  node_id: string;
  node_name: string;
  node_type: string;
  grants: GrantReach[];
  admins: UserBrief[];
}

export interface AccessCheck {
  user: UserBrief;
  user_role: string;
  is_admin: boolean;
  groups: string[];
  permissions: Permission[];
  grants: GrantReach[];
}

// ── Keys ────────────────────────────────────────────────────────────────────

export const accessKeys = {
  all: ["access"] as const,
  meta: () => [...accessKeys.all, "meta"] as const,
  roles: () => [...accessKeys.all, "roles"] as const,
  groups: () => [...accessKeys.all, "groups"] as const,
  grants: () => [...accessKeys.all, "grants"] as const,
  node: (nodeId: string) => [...accessKeys.all, "node", nodeId] as const,
  check: (userId: string, nodeId: string) => [...accessKeys.all, "check", userId, nodeId] as const,
  // Not under `all`: the per-object permissions belong with the object.
  permissions: (nodeId: string) => ["nodePermissions", nodeId] as const,
};

/** Anything changed in Behörigheter may change what everyone may do. */
function useInvalidateAccess() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: accessKeys.all });
    qc.invalidateQueries({ queryKey: ["nodePermissions"] });
    qc.invalidateQueries({ queryKey: ["nodeContent"] });
    qc.invalidateQueries({ queryKey: ["me"] });
  };
}

// ── Queries ─────────────────────────────────────────────────────────────────

export function useAccessMeta() {
  return useQuery({
    queryKey: accessKeys.meta(),
    queryFn: async () => (await apiClient.get<AccessMeta>("/access/meta")).data,
    staleTime: Infinity,
  });
}

export function useRoles(enabled = true) {
  return useQuery({
    queryKey: accessKeys.roles(),
    enabled,
    queryFn: async () => (await apiClient.get<Role[]>("/access/roles")).data,
  });
}

export function useGroups(enabled = true) {
  return useQuery({
    queryKey: accessKeys.groups(),
    enabled,
    queryFn: async () => (await apiClient.get<Group[]>("/access/groups")).data,
  });
}

export function useGrants() {
  return useQuery({
    queryKey: accessKeys.grants(),
    queryFn: async () => (await apiClient.get<Grant[]>("/access/grants")).data,
  });
}

export function useNodeAccess(nodeId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: accessKeys.node(nodeId ?? ""),
    enabled: Boolean(nodeId) && enabled,
    queryFn: async () => (await apiClient.get<NodeAccess>(`/access/nodes/${nodeId}`)).data,
  });
}

export function useAccessCheck(userId: string | undefined, nodeId: string | undefined) {
  return useQuery({
    queryKey: accessKeys.check(userId ?? "", nodeId ?? ""),
    enabled: Boolean(userId && nodeId),
    queryFn: async () =>
      (await apiClient.get<AccessCheck>("/access/check", { params: { user_id: userId, node_id: nodeId } })).data,
  });
}

/** What the signed-in user may do with one object. */
export function useNodePermissions(nodeId: string | undefined) {
  return useQuery({
    queryKey: accessKeys.permissions(nodeId ?? ""),
    enabled: Boolean(nodeId),
    queryFn: async () => (await apiClient.get<NodePermissions>(`/nodes/${nodeId}/permissions`)).data,
  });
}

// ── Mutations ───────────────────────────────────────────────────────────────

export function useCreateRole() {
  const invalidate = useInvalidateAccess();
  return useMutation({
    mutationFn: async (input: { name: string; description: string; permissions: Permission[] }) =>
      (await apiClient.post<Role>("/access/roles", input)).data,
    onSuccess: invalidate,
  });
}

export function useUpdateRole() {
  const invalidate = useInvalidateAccess();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<Role, "name" | "description" | "permissions">> }) =>
      (await apiClient.patch<Role>(`/access/roles/${id}`, patch)).data,
    onSuccess: invalidate,
  });
}

export function useDeleteRole() {
  const invalidate = useInvalidateAccess();
  return useMutation({
    mutationFn: async (id: string) => { await apiClient.delete(`/access/roles/${id}`); },
    onSuccess: invalidate,
  });
}

export function useCreateGroup() {
  const invalidate = useInvalidateAccess();
  return useMutation({
    mutationFn: async (input: { name: string; description: string; member_ids: string[] }) =>
      (await apiClient.post<Group>("/access/groups", input)).data,
    onSuccess: invalidate,
  });
}

export function useUpdateGroup() {
  const invalidate = useInvalidateAccess();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { name?: string; description?: string } }) =>
      (await apiClient.patch<Group>(`/access/groups/${id}`, patch)).data,
    onSuccess: invalidate,
  });
}

export function useSetGroupMembers() {
  const invalidate = useInvalidateAccess();
  return useMutation({
    mutationFn: async ({ id, userIds }: { id: string; userIds: string[] }) =>
      (await apiClient.put<Group>(`/access/groups/${id}/members`, { user_ids: userIds })).data,
    onSuccess: invalidate,
  });
}

export function useDeleteGroup() {
  const invalidate = useInvalidateAccess();
  return useMutation({
    mutationFn: async (id: string) => { await apiClient.delete(`/access/groups/${id}`); },
    onSuccess: invalidate,
  });
}

export function useCreateGrant() {
  const invalidate = useInvalidateAccess();
  return useMutation({
    mutationFn: async (input: GrantCreate) => (await apiClient.post<Grant>("/access/grants", input)).data,
    onSuccess: invalidate,
  });
}

export function useDeleteGrant() {
  const invalidate = useInvalidateAccess();
  return useMutation({
    mutationFn: async (id: string) => { await apiClient.delete(`/access/grants/${id}`); },
    onSuccess: invalidate,
  });
}
