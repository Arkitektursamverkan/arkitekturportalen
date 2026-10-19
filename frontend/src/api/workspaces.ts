import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";

export type WorkspaceStatus = "active" | "archived";
/** "uppdrag" is an assignment, "arbetsgrupp" a standing working group. */
export type WorkspaceKind = "uppdrag" | "arbetsgrupp";
export type WorkspaceVisibility = "private" | "internal";
export type MemberRole = "owner" | "member" | "reader";
export type TaskStatus = "todo" | "doing" | "done";

export interface WorkspaceSummary {
  id: string;
  name: string;
  description: string;
  kind: WorkspaceKind;
  status: WorkspaceStatus;
  visibility: WorkspaceVisibility;
  /** What I may do here — "owner" also covers admins, "reader" covers non-members of an internal uppdrag. */
  my_role: MemberRole;
  is_member: boolean;
  member_count: number;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface Member {
  user_id: string;
  name: string;
  email: string;
  role: MemberRole;
  added_at: string;
  added_by: string | null;
}

export interface Workspace extends WorkspaceSummary {
  members: Member[];
}

export interface DirectoryUser {
  id: string;
  name: string;
  email: string;
}

export interface PageSummary {
  id: string;
  title: string;
  sort_order: number;
  updated_at: string;
  updated_by: string | null;
}

export interface WorkspacePage extends PageSummary {
  workspace_id: string;
  body: string;
  created_at: string;
  created_by: string | null;
}

export interface WorkspaceEvent {
  id: string;
  workspace_id: string;
  title: string;
  /** ISO timestamp. An all-day entry starts at local midnight. */
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string;
  description: string;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface MeetingSummary {
  id: string;
  title: string;
  meeting_date: string | null;
  /** Key of the template the notes were started from — see config/meetingTemplates. */
  template: string;
  updated_at: string;
  updated_by: string | null;
}

export interface Meeting extends MeetingSummary {
  workspace_id: string;
  body: string;
  created_at: string;
  created_by: string | null;
}

export interface WorkspaceFile {
  id: string;
  workspace_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  description: string;
  uploaded_at: string;
  uploaded_by: string | null;
  /** Set when the row is a link; `filename` then holds the link title. */
  url: string | null;
}

export interface Post {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  created_by: string | null;
  author_name: string | null;
  edited_at: string | null;
}

export interface Task {
  id: string;
  workspace_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignee_user_id: string | null;
  assignee_name: string | null;
  due_date: string | null;
  sort_order: number;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
  completed_at: string | null;
}

export const workspaceKeys = {
  all: ["workspaces"] as const,
  list: (kind?: WorkspaceKind) => ["workspaces", "list", kind ?? "all"] as const,
  item: (id: string) => ["workspaces", id] as const,
  members: (id: string) => ["workspaces", id, "members"] as const,
  pages: (id: string) => ["workspaces", id, "pages"] as const,
  page: (id: string, pageId: string) => ["workspaces", id, "pages", pageId] as const,
  events: (id: string) => ["workspaces", id, "events"] as const,
  meetings: (id: string) => ["workspaces", id, "meetings"] as const,
  meeting: (id: string, meetingId: string) => ["workspaces", id, "meetings", meetingId] as const,
  files: (id: string) => ["workspaces", id, "files"] as const,
  posts: (id: string) => ["workspaces", id, "posts"] as const,
  tasks: (id: string) => ["workspaces", id, "tasks"] as const,
  directory: () => ["workspaces", "directory"] as const,
};

export function canWrite(ws: Pick<WorkspaceSummary, "my_role" | "status"> | undefined): boolean {
  if (!ws) return false;
  return ws.status === "active" && (ws.my_role === "owner" || ws.my_role === "member");
}

// ── Workspaces ──────────────────────────────────────────────────────────────

export function useWorkspaces(kind?: WorkspaceKind, enabled = true) {
  return useQuery({
    queryKey: workspaceKeys.list(kind),
    enabled,
    queryFn: async () => {
      const { data } = await apiClient.get<WorkspaceSummary[]>("/workspaces", {
        params: kind ? { kind } : undefined,
      });
      return data;
    },
  });
}

export function useWorkspace(id: string | undefined) {
  return useQuery({
    queryKey: id ? workspaceKeys.item(id) : ["workspaces", "none"],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data } = await apiClient.get<Workspace>(`/workspaces/${id}`);
      return data;
    },
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      description?: string;
      kind?: WorkspaceKind;
      visibility?: WorkspaceVisibility;
      member_ids?: string[];
    }) => {
      const { data } = await apiClient.post<Workspace>("/workspaces", input);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.all }),
  });
}

export function useUpdateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: { id: string } & Partial<Pick<Workspace, "name" | "description" | "status" | "visibility">>) => {
      const { data } = await apiClient.patch<Workspace>(`/workspaces/${id}`, patch);
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(workspaceKeys.item(data.id), data);
      qc.invalidateQueries({ queryKey: workspaceKeys.all });
    },
  });
}

export function useDeleteWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/workspaces/${id}`);
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.all }),
  });
}

// ── Members ─────────────────────────────────────────────────────────────────

export function useDirectory(enabled: boolean) {
  return useQuery({
    queryKey: workspaceKeys.directory(),
    enabled,
    queryFn: async () => {
      const { data } = await apiClient.get<DirectoryUser[]>("/workspaces/directory");
      return data;
    },
  });
}

export function useAddMember(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { user_id: string; role?: MemberRole }) => {
      const { data } = await apiClient.post<Member[]>(`/workspaces/${workspaceId}/members`, input);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.all }),
  });
}

export function useSetMemberRole(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: MemberRole }) => {
      const { data } = await apiClient.patch<Member[]>(
        `/workspaces/${workspaceId}/members/${userId}`,
        { role },
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.all }),
  });
}

export function useRemoveMember(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { data } = await apiClient.delete<Member[]>(
        `/workspaces/${workspaceId}/members/${userId}`,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.all }),
  });
}

// ── Calendar ────────────────────────────────────────────────────────────────

export function useWorkspaceEvents(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceId ? workspaceKeys.events(workspaceId) : ["workspaces", "none", "events"],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data } = await apiClient.get<WorkspaceEvent[]>(`/workspaces/${workspaceId}/events`);
      return data;
    },
  });
}

export interface EventInput {
  title: string;
  starts_at: string;
  ends_at?: string | null;
  all_day?: boolean;
  location?: string;
  description?: string;
}

export function useCreateEvent(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: EventInput) => {
      const { data } = await apiClient.post<WorkspaceEvent>(
        `/workspaces/${workspaceId}/events`,
        input,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.events(workspaceId) }),
  });
}

export function useUpdateEvent(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<EventInput>) => {
      const { data } = await apiClient.patch<WorkspaceEvent>(
        `/workspaces/${workspaceId}/events/${id}`,
        patch,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.events(workspaceId) }),
  });
}

export function useDeleteEvent(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/workspaces/${workspaceId}/events/${id}`);
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.events(workspaceId) }),
  });
}

// ── Document pages ──────────────────────────────────────────────────────────

export function useWorkspacePages(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceId ? workspaceKeys.pages(workspaceId) : ["workspaces", "none", "pages"],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data } = await apiClient.get<PageSummary[]>(`/workspaces/${workspaceId}/pages`);
      return data;
    },
  });
}

export function useWorkspacePage(workspaceId: string | undefined, pageId: string | undefined) {
  return useQuery({
    queryKey:
      workspaceId && pageId
        ? workspaceKeys.page(workspaceId, pageId)
        : ["workspaces", "none", "page"],
    enabled: Boolean(workspaceId && pageId),
    queryFn: async () => {
      const { data } = await apiClient.get<WorkspacePage>(
        `/workspaces/${workspaceId}/pages/${pageId}`,
      );
      return data;
    },
  });
}

export function useCreatePage(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { title: string; body?: string }) => {
      const { data } = await apiClient.post<WorkspacePage>(
        `/workspaces/${workspaceId}/pages`,
        input,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.pages(workspaceId) }),
  });
}

export function useUpdatePage(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pageId,
      ...patch
    }: { pageId: string } & Partial<Pick<WorkspacePage, "title" | "body" | "sort_order">>) => {
      const { data } = await apiClient.patch<WorkspacePage>(
        `/workspaces/${workspaceId}/pages/${pageId}`,
        patch,
      );
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(workspaceKeys.page(workspaceId, data.id), data);
      qc.invalidateQueries({ queryKey: workspaceKeys.pages(workspaceId) });
    },
  });
}

export function useDeletePage(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pageId: string) => {
      await apiClient.delete(`/workspaces/${workspaceId}/pages/${pageId}`);
      return pageId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.pages(workspaceId) }),
  });
}

// ── Meetings ────────────────────────────────────────────────────────────────

export function useWorkspaceMeetings(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceId ? workspaceKeys.meetings(workspaceId) : ["workspaces", "none", "meetings"],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data } = await apiClient.get<MeetingSummary[]>(`/workspaces/${workspaceId}/meetings`);
      return data;
    },
  });
}

export function useWorkspaceMeeting(workspaceId: string | undefined, meetingId: string | undefined) {
  return useQuery({
    queryKey:
      workspaceId && meetingId
        ? workspaceKeys.meeting(workspaceId, meetingId)
        : ["workspaces", "none", "meeting"],
    enabled: Boolean(workspaceId && meetingId),
    queryFn: async () => {
      const { data } = await apiClient.get<Meeting>(
        `/workspaces/${workspaceId}/meetings/${meetingId}`,
      );
      return data;
    },
  });
}

export function useCreateMeeting(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      meeting_date?: string | null;
      template: string;
      body: string;
    }) => {
      const { data } = await apiClient.post<Meeting>(`/workspaces/${workspaceId}/meetings`, input);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.meetings(workspaceId) }),
  });
}

export function useUpdateMeeting(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      meetingId,
      ...patch
    }: { meetingId: string } & Partial<Pick<Meeting, "title" | "meeting_date" | "body">>) => {
      const { data } = await apiClient.patch<Meeting>(
        `/workspaces/${workspaceId}/meetings/${meetingId}`,
        patch,
      );
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(workspaceKeys.meeting(workspaceId, data.id), data);
      qc.invalidateQueries({ queryKey: workspaceKeys.meetings(workspaceId) });
    },
  });
}

export function useDeleteMeeting(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (meetingId: string) => {
      await apiClient.delete(`/workspaces/${workspaceId}/meetings/${meetingId}`);
      return meetingId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.meetings(workspaceId) }),
  });
}

// ── Files ───────────────────────────────────────────────────────────────────

export function useWorkspaceFiles(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceId ? workspaceKeys.files(workspaceId) : ["workspaces", "none", "files"],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data } = await apiClient.get<WorkspaceFile[]>(`/workspaces/${workspaceId}/files`);
      return data;
    },
  });
}

export function useUploadFile(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, description }: { file: File; description?: string }) => {
      const form = new FormData();
      form.append("file", file);
      form.append("description", description ?? "");
      const { data } = await apiClient.post<WorkspaceFile>(
        `/workspaces/${workspaceId}/files`,
        form,
        // No Content-Type here: axios strips its JSON default for FormData so
        // the browser can set the multipart boundary itself.
        { timeout: 120_000 },
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.files(workspaceId) }),
  });
}

export function useCreateLink(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { title: string; url: string; description: string }) => {
      const { data } = await apiClient.post<WorkspaceFile>(`/workspaces/${workspaceId}/links`, body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.files(workspaceId) }),
  });
}

export function useDeleteFile(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fileId: string) => {
      await apiClient.delete(`/workspaces/${workspaceId}/files/${fileId}`);
      return fileId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.files(workspaceId) }),
  });
}

/** Fetches through the API client so the auth header is applied, then saves locally. */
export async function downloadWorkspaceFile(workspaceId: string, file: WorkspaceFile): Promise<void> {
  const { data } = await apiClient.get<Blob>(
    `/workspaces/${workspaceId}/files/${file.id}/download`,
    { responseType: "blob", timeout: 120_000 },
  );
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Discussion ──────────────────────────────────────────────────────────────

export function useWorkspacePosts(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceId ? workspaceKeys.posts(workspaceId) : ["workspaces", "none", "posts"],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data } = await apiClient.get<Post[]>(`/workspaces/${workspaceId}/posts`);
      return data;
    },
  });
}

export function useCreatePost(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { body: string; parent_id?: string | null }) => {
      const { data } = await apiClient.post<Post>(`/workspaces/${workspaceId}/posts`, input);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.posts(workspaceId) }),
  });
}

export function useUpdatePost(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, body }: { postId: string; body: string }) => {
      const { data } = await apiClient.patch<Post>(
        `/workspaces/${workspaceId}/posts/${postId}`,
        { body },
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.posts(workspaceId) }),
  });
}

export function useDeletePost(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      await apiClient.delete(`/workspaces/${workspaceId}/posts/${postId}`);
      return postId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.posts(workspaceId) }),
  });
}

// ── Tasks ───────────────────────────────────────────────────────────────────

export function useWorkspaceTasks(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceId ? workspaceKeys.tasks(workspaceId) : ["workspaces", "none", "tasks"],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data } = await apiClient.get<Task[]>(`/workspaces/${workspaceId}/tasks`);
      return data;
    },
  });
}

export function useCreateTask(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      description?: string;
      assignee_user_id?: string | null;
      due_date?: string | null;
    }) => {
      const { data } = await apiClient.post<Task>(`/workspaces/${workspaceId}/tasks`, input);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.tasks(workspaceId) }),
  });
}

export function useUpdateTask(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      taskId,
      ...patch
    }: { taskId: string } & Partial<
      Pick<Task, "title" | "description" | "status" | "assignee_user_id" | "due_date" | "sort_order">
    >) => {
      const { data } = await apiClient.patch<Task>(
        `/workspaces/${workspaceId}/tasks/${taskId}`,
        patch,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.tasks(workspaceId) }),
  });
}

export function useDeleteTask(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      await apiClient.delete(`/workspaces/${workspaceId}/tasks/${taskId}`);
      return taskId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.tasks(workspaceId) }),
  });
}
