import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";

/**
 * A report tag is a heading in the Rapporter listing. Which reports sit under
 * it is a list of stable keys — `"portfolio"` for a built-in report,
 * `"published:<uuid>"` for a published survey edition — because the built-in
 * reports are pages, not rows.
 */
export interface ReportTag {
  id: string;
  slug: string;
  name: string;
  color: string;
  sort_order: number;
  report_keys: string[];
}

const KEYS = {
  list: ["report-tags"] as const,
};

export function useReportTags() {
  return useQuery({
    queryKey: KEYS.list,
    queryFn: async () => {
      const { data } = await apiClient.get<ReportTag[]>("/report-tags");
      return data;
    },
    // The sidebar asks for these on every page; they change rarely.
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateReportTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      name: string;
      color: string;
      sort_order: number;
      report_keys?: string[];
    }) => {
      const { data } = await apiClient.post<ReportTag>("/report-tags", body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list }),
  });
}

export function useUpdateReportTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: {
      id: string;
      name?: string;
      color?: string;
      sort_order?: number;
    }) => {
      const { data } = await apiClient.patch<ReportTag>(`/report-tags/${id}`, body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list }),
  });
}

export function useDeleteReportTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/report-tags/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list }),
  });
}

/** Replace one report's whole tag set. The response is the regrouped listing. */
export function useSetReportTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ reportKey, tagIds }: { reportKey: string; tagIds: string[] }) => {
      const { data } = await apiClient.put<ReportTag[]>(
        `/report-tags/assignments/${encodeURIComponent(reportKey)}`,
        { tag_ids: tagIds },
      );
      return data;
    },
    onSuccess: (data) => qc.setQueryData(KEYS.list, data),
  });
}

/** report key → the tags it carries, in menu order. */
export function tagsByReportKey(tags: ReportTag[] | undefined): Map<string, ReportTag[]> {
  const map = new Map<string, ReportTag[]>();
  for (const tag of tags ?? []) {
    for (const key of tag.report_keys) {
      const list = map.get(key);
      if (list) list.push(tag);
      else map.set(key, [tag]);
    }
  }
  return map;
}

/** One heading in the grouped listing, with the items filed under it. */
export interface TagGroup<T> {
  /** null for the trailing "Övrigt" group of untagged reports. */
  tag: ReportTag | null;
  items: T[];
}

/**
 * Group items by tag. An item carrying two tags appears under both headings —
 * that is the point of tags over a single category. Untagged items collect in
 * a final group with `tag: null`, and empty tags are left out.
 */
export function groupByTag<T>(
  items: T[],
  keyOf: (item: T) => string,
  tags: ReportTag[] | undefined,
): TagGroup<T>[] {
  const byKey = tagsByReportKey(tags);
  const buckets = new Map<string, TagGroup<T>>();
  const untagged: T[] = [];

  for (const item of items) {
    const itemTags = byKey.get(keyOf(item)) ?? [];
    if (itemTags.length === 0) {
      untagged.push(item);
      continue;
    }
    for (const tag of itemTags) {
      const bucket = buckets.get(tag.id);
      if (bucket) bucket.items.push(item);
      else buckets.set(tag.id, { tag, items: [item] });
    }
  }

  const groups = [...buckets.values()].sort((a, b) => {
    const order = (a.tag?.sort_order ?? 0) - (b.tag?.sort_order ?? 0);
    return order !== 0 ? order : (a.tag?.name ?? "").localeCompare(b.tag?.name ?? "", "sv");
  });
  if (untagged.length > 0) groups.push({ tag: null, items: untagged });
  return groups;
}
