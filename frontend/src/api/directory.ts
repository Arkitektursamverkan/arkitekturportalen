import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { apiClient } from "./client";
import { directoryRequest } from "@/auth/msalConfig";
import { getMsal } from "@/auth/msal";

/**
 * Personer och avdelningar ur Entra ID.
 *
 * Kopian hämtas när en admin ber om det, i den administratörens eget namn:
 * webbläsaren begär en Graph-biljett (User.Read.All, delegerad) och skickar
 * den med anropet. Appen har ingen egen hemlighet, så ingen automatisk
 * hämtning sker. Tills första
 * hämtningen har gått innehåller avdelningslistan bara namn som skrivits på
 * kalenderposter (source = "register").
 */
export interface Department {
  name: string;
  /** Antal personer; null när namnet inte kommer ur Entra ID. */
  people: number | null;
}

/** En avdelning i adminlistan – dolda avdelningar går inte att välja. */
export interface AdminDepartment {
  name: string;
  people: number;
  hidden: boolean;
}

export interface DepartmentList {
  source: "entra" | "register";
  departments: Department[];
}

export interface DirectoryStatus {
  configured: boolean;
  people: number;
  departments: number;
  without_department: number;
  last_synced_at: string | null;
}

export const directoryKeys = {
  all: ["directory"] as const,
  departments: ["directory", "departments"] as const,
  status: ["directory", "status"] as const,
  allDepartments: ["directory", "departments", "all"] as const,
};

export function useDepartments() {
  return useQuery({
    queryKey: directoryKeys.departments,
    queryFn: async () => {
      const { data } = await apiClient.get<DepartmentList>("/directory/departments");
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useDirectoryStatus() {
  return useQuery({
    queryKey: directoryKeys.status,
    queryFn: async () => {
      const { data } = await apiClient.get<DirectoryStatus>("/directory/status");
      return data;
    },
  });
}

/** Graph-biljett för den inloggade administratören; frågar i ett fönster om det behövs. */
async function acquireGraphToken(): Promise<string> {
  const msal = await getMsal();
  const account = msal ? msal.getActiveAccount() ?? msal.getAllAccounts()[0] : null;
  if (!msal || !account) {
    throw new Error("Katalogen kan bara hämtas av en administratör som är inloggad med Microsoft-konto.");
  }
  try {
    return (await msal.acquireTokenSilent({ ...directoryRequest, account })).accessToken;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      return (await msal.acquireTokenPopup({ ...directoryRequest, account })).accessToken;
    }
    throw err;
  }
}

export function useSyncDirectory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const graph_token = await acquireGraphToken();
      const { data } = await apiClient.post<DirectoryStatus>("/directory/sync", { graph_token });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: directoryKeys.all }),
  });
}

export function useAllDepartments() {
  return useQuery({
    queryKey: directoryKeys.allDepartments,
    queryFn: async () => {
      const { data } = await apiClient.get<AdminDepartment[]>("/directory/departments/all");
      return data;
    },
  });
}

export function useSetDepartmentHidden() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; hidden: boolean }) =>
      apiClient.put<AdminDepartment[]>("/directory/departments/visibility", input).then((r) => r.data),
    onSuccess: (data) => {
      qc.setQueryData(directoryKeys.allDepartments, data);
      qc.invalidateQueries({ queryKey: directoryKeys.departments, exact: true });
    },
  });
}
