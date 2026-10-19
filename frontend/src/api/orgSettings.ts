import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import { moduleForPath, type ModuleKey } from "@/config/modules";
import type { Navigation } from "@/config/navigation";

export interface OrgSettingsValues {
  org_name: string | null;
  org_short_name: string | null;
  brand_color: string | null;
  allowed_email_domains: string | null;
  change_log_departments: string | null;
  anonymous_read: boolean | null;
  /** Keys of the optional modules switched on; [] = none, null = not set. */
  modules: string[] | null;
}

/** An optional part of the app (backend app/modules.py). */
export interface ModuleInfo {
  key: string;
  name: string;
  description: string;
}

export interface OrgSettingsAdmin {
  /** Set under Administration; null = not set, the default applies. */
  values: OrgSettingsValues;
  /** From the installation's environment. */
  defaults: OrgSettingsValues;
  has_logo: boolean;
  updated_by: string | null;
  module_catalog: ModuleInfo[];
}

export interface OrgSettingsPublic {
  org_name: string | null;
  org_short_name: string | null;
  brand_color: string | null;
  logo_version: string | null;
  /** The optional modules switched on. */
  modules: string[];
  /** The left menu as an admin arranged it; null = the standard menu. */
  navigation: Navigation | null;
}

const ADMIN_KEY = ["org-settings", "admin"] as const;
const PUBLIC_KEY = ["org-settings", "public"] as const;

export function orgLogoUrl(version: string | null): string | null {
  return version ? `/api/v1/org-settings/logo?v=${encodeURIComponent(version)}` : null;
}

/** Name, short name, brand colour and logo: readable without signing in. */
export function usePublicOrgSettings() {
  return useQuery({
    queryKey: PUBLIC_KEY,
    queryFn: async () => (await apiClient.get<OrgSettingsPublic>("/org-settings/public")).data,
    staleTime: 5 * 60_000,
  });
}

/** The running version, as the API image reports it ("dev" when built locally). */
export function useAppVersion() {
  return useQuery({
    queryKey: ["health", "version"],
    queryFn: async () => (await apiClient.get<{ version: string }>("/health")).data.version,
    staleTime: 5 * 60_000,
  });
}

export function useOrgSettings() {
  return useQuery({
    queryKey: ADMIN_KEY,
    queryFn: async () => (await apiClient.get<OrgSettingsAdmin>("/org-settings")).data,
  });
}

function useSaved() {
  const qc = useQueryClient();
  return (data: OrgSettingsAdmin) => {
    qc.setQueryData(ADMIN_KEY, data);
    qc.invalidateQueries({ queryKey: PUBLIC_KEY });
  };
}

export function useUpdateOrgSettings() {
  const onSuccess = useSaved();
  return useMutation({
    mutationFn: async (values: Partial<OrgSettingsValues>) =>
      (await apiClient.put<OrgSettingsAdmin>("/org-settings", values)).data,
    onSuccess,
  });
}

export function useUploadOrgLogo() {
  const onSuccess = useSaved();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return (
        await apiClient.put<OrgSettingsAdmin>("/org-settings/logo", form, {
          headers: { "Content-Type": "multipart/form-data" },
        })
      ).data;
    },
    onSuccess,
  });
}

export function useDeleteOrgLogo() {
  const onSuccess = useSaved();
  return useMutation({
    mutationFn: async () => (await apiClient.delete<OrgSettingsAdmin>("/org-settings/logo")).data,
    onSuccess,
  });
}

/** The organisation's short name (or full name), empty until loaded or if unset. */
export function useOrgName(): string {
  const { data } = usePublicOrgSettings();
  return data?.org_short_name || data?.org_name || "";
}

/** Swedish genitive: "IT:s", "Exempelkommunens", "Västerås". */
export function genitive(name: string): string {
  // Abbreviations and numbers take a colon, even when they end in s.
  if (/^[\p{Lu}\d]+$/u.test(name) || /\d$/.test(name)) return `${name}:s`;
  if (/[sxz]$/i.test(name)) return name;
  return `${name}s`;
}

/**
 * The optional modules switched on (config/modules.ts). `ready` is false
 * until the settings have loaded, so callers can avoid flashing a page as
 * switched off; until then nothing is reported as on.
 */
export function useModules(): {
  ready: boolean;
  enabled: (key: ModuleKey) => boolean;
  pathEnabled: (path: string) => boolean;
} {
  const { data, isError } = usePublicOrgSettings();
  const modules = data?.modules;
  // Stable while the module list is, so the functions can be hook dependencies.
  const fns = useMemo(() => {
    const on = new Set(modules ?? []);
    const enabled = (key: ModuleKey) => on.has(key);
    return {
      enabled,
      pathEnabled: (path: string) => {
        const key = moduleForPath(path);
        return key === null || enabled(key);
      },
    };
  }, [modules]);
  // If the settings cannot be read, show the core rather than spin forever.
  return { ready: data !== undefined || isError, ...fns };
}

/** Arrange the left menu for everyone, or with null go back to the standard. */
export function useSaveNavigation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (nav: Navigation | null) =>
      nav === null
        ? (await apiClient.delete<OrgSettingsPublic>("/org-settings/navigation")).data
        : (await apiClient.put<OrgSettingsPublic>("/org-settings/navigation", nav)).data,
    onSuccess: (data) => qc.setQueryData(PUBLIC_KEY, data),
  });
}
