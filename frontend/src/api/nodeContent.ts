import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";

// ── Types ───────────────────────────────────────────────────────────────────

/** What the signed-in user may do on one object — decided by the backend. */
export interface NodePermissions {
  /** Change the object and its connections, and delete it. */
  edit_object: boolean;
  read_documents: boolean;
  read_restricted: boolean;
  write_documents: boolean;
  read_notes: boolean;
  write_notes: boolean;
  /** Edit and delete what others wrote or uploaded. */
  manage: boolean;
}

export type DocumentType = "rutin" | "instruktion" | "avtal" | "beslut" | "utredning" | "ovrigt";
export const DOCUMENT_TYPES: DocumentType[] = ["rutin", "instruktion", "avtal", "beslut", "utredning", "ovrigt"];
export type Classification = "intern" | "begransad";

export interface DocumentVersion {
  id: string;
  version_no: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  comment: string;
  uploaded_at: string;
  uploaded_by: string | null;
}

export interface NodeDocument {
  id: string;
  node_id: string;
  kind: "file" | "link";
  title: string;
  doc_type: DocumentType;
  description: string;
  classification: Classification;
  url: string | null;
  review_date: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
  current_version: DocumentVersion | null;
  version_count: number;
  can_edit: boolean;
}

export interface DocumentList {
  permissions: NodePermissions;
  documents: NodeDocument[];
}

export interface DocumentMeta {
  title: string;
  doc_type: DocumentType;
  description: string;
  classification: Classification;
  review_date: string | null;
}

export type NoteVisibility = "shared" | "private";

export interface NodeNote {
  id: string;
  node_id: string;
  body: string;
  visibility: NoteVisibility;
  pinned: boolean;
  author_name: string | null;
  created_at: string;
  edited_at: string | null;
  is_mine: boolean;
  can_edit: boolean;
}

export interface NoteList {
  permissions: NodePermissions;
  notes: NodeNote[];
}

// ── Keys ────────────────────────────────────────────────────────────────────

export const nodeContentKeys = {
  documents: (nodeId: string) => ["nodeContent", nodeId, "documents"] as const,
  versions: (nodeId: string, docId: string) => ["nodeContent", nodeId, "documents", docId, "versions"] as const,
  notes: (nodeId: string) => ["nodeContent", nodeId, "notes"] as const,
  summary: (nodeId: string) => ["nodeContent", nodeId, "summary"] as const,
};

// ── Documents ───────────────────────────────────────────────────────────────

export function useNodeDocuments(nodeId: string | undefined) {
  return useQuery({
    queryKey: nodeContentKeys.documents(nodeId ?? ""),
    enabled: Boolean(nodeId),
    queryFn: async () => {
      const { data } = await apiClient.get<DocumentList>(`/nodes/${nodeId}/documents`);
      return data;
    },
  });
}

export function useDocumentVersions(nodeId: string, docId: string | undefined) {
  return useQuery({
    queryKey: nodeContentKeys.versions(nodeId, docId ?? ""),
    enabled: Boolean(docId),
    queryFn: async () => {
      const { data } = await apiClient.get<DocumentVersion[]>(`/nodes/${nodeId}/documents/${docId}/versions`);
      return data;
    },
  });
}

function useInvalidateDocuments(nodeId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: nodeContentKeys.documents(nodeId) });
    qc.invalidateQueries({ queryKey: nodeContentKeys.summary(nodeId) });
  };
}

export function useUploadDocument(nodeId: string) {
  const invalidate = useInvalidateDocuments(nodeId);
  return useMutation({
    mutationFn: async ({ file, meta }: { file: File; meta: DocumentMeta }) => {
      const form = new FormData();
      form.append("file", file);
      form.append("title", meta.title);
      form.append("doc_type", meta.doc_type);
      form.append("description", meta.description);
      form.append("classification", meta.classification);
      form.append("review_date", meta.review_date ?? "");
      // No Content-Type here: axios strips its JSON default for FormData so
      // the browser can set the multipart boundary itself.
      const { data } = await apiClient.post<NodeDocument>(`/nodes/${nodeId}/documents/file`, form, { timeout: 120_000 });
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useCreateLink(nodeId: string) {
  const invalidate = useInvalidateDocuments(nodeId);
  return useMutation({
    mutationFn: async (input: DocumentMeta & { url: string }) => {
      const { data } = await apiClient.post<NodeDocument>(`/nodes/${nodeId}/documents/link`, input);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateDocument(nodeId: string) {
  const invalidate = useInvalidateDocuments(nodeId);
  return useMutation({
    mutationFn: async ({ docId, patch }: { docId: string; patch: Partial<DocumentMeta> & { url?: string } }) => {
      const body = { ...patch, clear_review_date: patch.review_date === null };
      const { data } = await apiClient.patch<NodeDocument>(`/nodes/${nodeId}/documents/${docId}`, body);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUploadVersion(nodeId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateDocuments(nodeId);
  return useMutation({
    mutationFn: async ({ docId, file, comment }: { docId: string; file: File; comment: string }) => {
      const form = new FormData();
      form.append("file", file);
      form.append("comment", comment);
      const { data } = await apiClient.post<NodeDocument>(`/nodes/${nodeId}/documents/${docId}/versions`, form, { timeout: 120_000 });
      return data;
    },
    onSuccess: (doc) => {
      invalidate();
      qc.invalidateQueries({ queryKey: nodeContentKeys.versions(nodeId, doc.id) });
    },
  });
}

export function useDeleteDocument(nodeId: string) {
  const invalidate = useInvalidateDocuments(nodeId);
  return useMutation({
    mutationFn: async (docId: string) => {
      await apiClient.delete(`/nodes/${nodeId}/documents/${docId}`);
    },
    onSuccess: invalidate,
  });
}

/** Fetches through the API client so the auth header is applied, then saves
 *  the file — or, for a PDF asked to be opened, shows it in a new tab. */
export async function fetchDocumentFile(
  nodeId: string,
  docId: string,
  version: DocumentVersion,
  mode: "download" | "open" = "download",
): Promise<void> {
  const { data } = await apiClient.get<Blob>(`/nodes/${nodeId}/documents/${docId}/download`, {
    params: { version: version.version_no },
    responseType: "blob",
    timeout: 120_000,
  });
  const url = URL.createObjectURL(data);
  if (mode === "open") {
    window.open(url, "_blank", "noopener");
    // The new tab has loaded the blob by the time a minute has passed.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  const a = document.createElement("a");
  a.href = url;
  a.download = version.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Notes ───────────────────────────────────────────────────────────────────

export function useNodeNotes(nodeId: string | undefined) {
  return useQuery({
    queryKey: nodeContentKeys.notes(nodeId ?? ""),
    enabled: Boolean(nodeId),
    queryFn: async () => {
      const { data } = await apiClient.get<NoteList>(`/nodes/${nodeId}/notes`);
      return data;
    },
  });
}

function useInvalidateNotes(nodeId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: nodeContentKeys.notes(nodeId) });
    qc.invalidateQueries({ queryKey: nodeContentKeys.summary(nodeId) });
  };
}

export function useCreateNote(nodeId: string) {
  const invalidate = useInvalidateNotes(nodeId);
  return useMutation({
    mutationFn: async (input: { body: string; visibility: NoteVisibility; pinned?: boolean }) => {
      const { data } = await apiClient.post<NodeNote>(`/nodes/${nodeId}/notes`, input);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateNote(nodeId: string) {
  const invalidate = useInvalidateNotes(nodeId);
  return useMutation({
    mutationFn: async ({ noteId, patch }: { noteId: string; patch: Partial<Pick<NodeNote, "body" | "visibility" | "pinned">> }) => {
      const { data } = await apiClient.patch<NodeNote>(`/nodes/${nodeId}/notes/${noteId}`, patch);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteNote(nodeId: string) {
  const invalidate = useInvalidateNotes(nodeId);
  return useMutation({
    mutationFn: async (noteId: string) => {
      await apiClient.delete(`/nodes/${nodeId}/notes/${noteId}`);
    },
    onSuccess: invalidate,
  });
}

// ── Summary ─────────────────────────────────────────────────────────────────

/** Everything that goes with the object when it is deleted — private notes
 *  and restricted documents included. */
export function useNodeContentSummary(nodeId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: nodeContentKeys.summary(nodeId ?? ""),
    enabled: Boolean(nodeId) && enabled,
    queryFn: async () => {
      const { data } = await apiClient.get<{ documents: number; notes: number }>(`/nodes/${nodeId}/content-summary`);
      return data;
    },
  });
}
