import { create } from "zustand";

type Role = "admin" | "superuser" | "user" | "system";
export type AccessLevel = "none" | "read" | "edit";

interface RoleState {
  role: Role;
  /** ea_users.id – vem som får dra tillbaka sitt eget ändringsförslag. */
  id: string;
  isAdmin: boolean;
  isEditor: boolean;
  name: string;
  email: string;
  /** Whether to offer the Servrar page ("read" also when a grant reaches
   *  only some servers) and its create button ("edit"); admins have "edit". */
  serverAccess: AccessLevel;
  /** Per object type: the level that holds for every object of the type —
   *  what create buttons go by. Edit rights on single objects come with the
   *  object (GET /nodes/{id}/permissions). */
  typeAccess: Record<string, AccessLevel>;
  setUser: (u: {
    id: string; role: Role; name: string; email: string;
    access?: Record<string, AccessLevel>; typeAccess?: Record<string, AccessLevel>;
  }) => void;
  reset: () => void;
}

/**
 * In-memory store for the signed-in user's role. Populated by UserSync from
 * /api/v1/users/me on app load. Not persisted — the source of truth is the
 * backend, which decides role from the JWT.
 *
 * isEditor = admin || superuser || system — gate for create/edit-style UI.
 * isAdmin = admin || system — gate for administrative UI.
 * serverAccess / typeAccess = what the backend's grants give (see app/access.py).
 */
export const useRoleStore = create<RoleState>()((set) => ({
  role: "user",
  id: "",
  isAdmin: false,
  isEditor: false,
  name: "",
  email: "",
  serverAccess: "none",
  typeAccess: {},
  setUser: ({ id, role, name, email, access, typeAccess }) =>
    set({
      id,
      role,
      isAdmin: role === "admin" || role === "system",
      isEditor: role === "admin" || role === "superuser" || role === "system",
      name,
      email,
      serverAccess: access?.servers ?? "none",
      typeAccess: typeAccess ?? {},
    }),
  reset: () => set({ id: "", role: "user", isAdmin: false, isEditor: false, name: "", email: "", serverAccess: "none", typeAccess: {} }),
}));
