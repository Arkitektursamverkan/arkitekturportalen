import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";

/** A quick link an admin put up for everyone (backend app/schemas/shared_links.py). */
export interface SharedLink {
  title: string;
  /** https://…, http://… or a path on the same server (/…). */
  url: string;
  description?: string | null;
  new_tab?: boolean;
}

export const SHARED_LINKS_MAX = 12;

const KEY = ["org-settings", "shared-links"] as const;

/** The shared quick links, shown first on the start page. */
export function useSharedLinks() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await apiClient.get<{ links: SharedLink[] }>("/org-settings/shared-links")).data.links,
    staleTime: 5 * 60_000,
  });
}

/** Replace the shared quick links (admins); an empty list removes them. */
export function useUpdateSharedLinks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (links: SharedLink[]) =>
      (await apiClient.put<{ links: SharedLink[] }>("/org-settings/shared-links", { links })).data.links,
    onSuccess: (links) => qc.setQueryData(KEY, links),
  });
}

/** The same check as the API: http(s), or a path on this server — never javascript:, data: or //host. */
export function isValidLinkUrl(url: string): boolean {
  const v = url.trim();
  // eslint-disable-next-line no-control-regex -- styrtecken ska just hittas
  if (/[\u0000-\u001f\u007f-\u009f]/.test(v)) return false;
  return /^(https?:\/\/[^\s/\\$.?#][^\s]*|\/(?![/\\])[^\s]*)$/i.test(v);
}

/**
 * Anchor attributes for a link. A path on this server is opened as a page of
 * its own (a full load, not the app's router), since it usually is something
 * served beside the portal.
 */
export function linkAnchorProps(link: SharedLink): { href: string; target?: string; rel?: string } {
  return link.new_tab ? { href: link.url, target: "_blank", rel: "noopener noreferrer" } : { href: link.url };
}
