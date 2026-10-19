import { useQuery } from "@tanstack/react-query";
import { apiClient } from "./client";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: "user" | "superuser" | "admin" | "system";
  /** Whether to offer the Servrar page: { servers: "none" | "read" | "edit" }.
   *  "read" also when a grant reaches only some servers. */
  access?: Record<string, "none" | "read" | "edit">;
  /** Level per object type that holds for every object of the type — what
   *  create buttons go by. Per-object rights come with each object. */
  type_access?: Record<string, "none" | "read" | "edit">;
}

export const meKeys = {
  all: ["me"] as const,
};

export function useCurrentUser() {
  return useQuery({
    queryKey: meKeys.all,
    queryFn: async () => {
      const { data } = await apiClient.get<CurrentUser>("/users/me");
      return data;
    },
    staleTime: 5 * 60_000,
  });
}
