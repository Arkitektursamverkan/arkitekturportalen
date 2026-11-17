/**
 * Who holds which role on which object – the arithmetic behind the person
 * search in the owner overview. Roles are plain attributes on the objects
 * (system owner, system manager …), so a person is whoever is named in one.
 */

/** The attributes that name a person (or a group) responsible for the object. */
export const ROLE_FIELDS: string[] = [
  "systemägare",
  "systemförvaltare",
  "systemadministratör",
  "ägare",
  "owner",
  "application_owner",
  "business_owner",
  "data_owner",
  "teknisk_ägare",
  "technical_owner",
  "ansvarig",
];

export interface RoleNode {
  id: string;
  name: string;
  type: string;
  archived?: boolean;
  attributes?: Record<string, unknown> | null;
}

export interface PersonRole {
  node_id: string;
  node_name: string;
  node_type: string;
  /** The role attributes the person is named in on this object, in ROLE_FIELDS order. */
  roles: string[];
}

export interface Person {
  /** The name as first written. */
  name: string;
  /** One row per object, by type and name. */
  objects: PersonRole[];
  /** How many objects the person holds each role on. */
  perRole: Record<string, number>;
}

/** The names in a role attribute: several may share it, separated like in a recipient list. */
export function namesIn(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value.split(/[,;/\n]+/).map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean);
}

const keyOf = (name: string) => name.toLocaleLowerCase("sv");

/** Everyone named in a role on an object that is not archived, by name. */
export function peopleWithRoles(nodes: RoleNode[], fields: string[] = ROLE_FIELDS): Person[] {
  const people = new Map<string, Person>();
  for (const node of nodes) {
    if (node.archived) continue;
    const mine = new Map<string, PersonRole>();
    for (const field of fields) {
      for (const name of namesIn(node.attributes?.[field])) {
        const key = keyOf(name);
        const person = people.get(key) ?? { name, objects: [], perRole: {} };
        people.set(key, person);
        let row = mine.get(key);
        if (!row) {
          row = { node_id: node.id, node_name: node.name, node_type: node.type, roles: [] };
          mine.set(key, row);
          person.objects.push(row);
        }
        if (!row.roles.includes(field)) {
          row.roles.push(field);
          person.perRole[field] = (person.perRole[field] ?? 0) + 1;
        }
      }
    }
  }
  const out = [...people.values()];
  out.forEach((p) => p.objects.sort((a, b) =>
    a.node_type.localeCompare(b.node_type, "sv") || a.node_name.localeCompare(b.node_name, "sv")));
  return out.sort((a, b) => a.name.localeCompare(b.name, "sv"));
}
