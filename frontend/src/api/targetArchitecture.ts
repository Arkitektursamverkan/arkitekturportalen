import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";

export type DomainKey = "business" | "data" | "application" | "technology";

export interface FactBox {
  subject: string;
  bullets: string[];
  instead_of: string;
  we_say: string;
  implications: string[];
}

export interface TextSection {
  id: string;
  kind: "text";
  title: string;
  body: string;
}

export interface VisionSection {
  id: string;
  kind: "vision";
  title: string;
  body: string;
}

export interface DomainSection {
  id: string;
  kind: "domain";
  title: string;
  domain_key: DomainKey;
  describes: string;
  answers: string;
  desired_state: string[];
  fact_boxes: FactBox[];
}

export type Section = TextSection | VisionSection | DomainSection;
export type SectionKind = Section["kind"];

export interface TargetArchitectureContent {
  sections: Section[];
}

export interface TargetArchitectureRead {
  content: TargetArchitectureContent;
  updated_at: string;
  updated_by: string | null;
}

const KEY = ["target-architecture"] as const;

export function useTargetArchitecture(enabled = true) {
  return useQuery({
    queryKey: KEY,
    enabled,
    queryFn: async () => {
      const { data } = await apiClient.get<TargetArchitectureRead>("/target-architecture");
      return data;
    },
    staleTime: 60_000,
  });
}

export interface DocumentVersion {
  id: string;
  document_type: string;
  version_major: number;
  version_minor: number;
  is_major: boolean;
  change_summary: string | null;
  created_at: string;
  created_by: string | null;
}

export interface DocumentVersionList {
  items: DocumentVersion[];
  latest: DocumentVersion | null;
  pending_changes: number;
}

const VERSIONS_KEY = ["target-architecture", "versions"] as const;

export function useTargetArchitectureVersions() {
  return useQuery({
    queryKey: VERSIONS_KEY,
    queryFn: async () => {
      const { data } = await apiClient.get<DocumentVersionList>("/target-architecture/versions");
      return data;
    },
    staleTime: 30_000,
  });
}

export async function downloadTargetArchitecturePdf(
  opts: { bump?: "major" | "minor"; changeNote?: string; approved?: boolean } = {},
): Promise<void> {
  const params: Record<string, string> = {};
  if (opts.bump) params.bump = opts.bump;
  if (opts.changeNote && opts.changeNote.trim()) params.change_note = opts.changeNote.trim();
  if (opts.approved) params.approved = "true";
  const response = await apiClient.get("/target-architecture/export", {
    params,
    responseType: "blob",
  });
  const cd = response.headers["content-disposition"] as string | undefined;
  const match = cd?.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : "Målarkitektur.pdf";
  triggerDownload(response.data as Blob, filename);
}

export async function downloadTargetArchitectureVersionPdf(versionId: string): Promise<void> {
  const response = await apiClient.get(`/target-architecture/versions/${versionId}/export`, {
    responseType: "blob",
  });
  const cd = response.headers["content-disposition"] as string | undefined;
  const match = cd?.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : "Målarkitektur.pdf";
  triggerDownload(response.data as Blob, filename);
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function useUpdateTargetArchitecture() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (content: TargetArchitectureContent) => {
      const { data } = await apiClient.put<TargetArchitectureRead>("/target-architecture", content);
      return data;
    },
    onSuccess: (data) => qc.setQueryData(KEY, data),
  });
}

/** Stable section id generator. */
export function makeSectionId(kind: SectionKind, title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "section";
  return `${kind}-${slug}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Factory for a new section of a given kind. */
export function newSection(kind: SectionKind, title: string): Section {
  const id = makeSectionId(kind, title);
  switch (kind) {
    case "text":
      return { id, kind, title, body: "" };
    case "vision":
      return { id, kind, title, body: "" };
    case "domain":
      return {
        id,
        kind,
        title,
        domain_key: "business",
        describes: "",
        answers: "",
        desired_state: [],
        fact_boxes: [],
      };
  }
}
