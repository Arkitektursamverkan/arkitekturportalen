/**
 * The lists under the architecture domains (backend app/domain_lists.py): an
 * admin can switch off the optional built-in ones and add lists of their own.
 */
import type { NodeType } from "@/types/graph";

export type DomainKey = "business" | "information" | "application" | "technology";
export type ListFieldType = "text" | "number" | "date" | "choice" | "link";

export interface ListField {
  key: string;
  label: string;
  type: ListFieldType;
  options: string[];
}

export interface CustomList {
  key: string;
  name: string;
  domain: DomainKey;
  active: boolean;
  fields: ListField[];
}

/** A field an admin added to a built-in object type or a connection type. */
export interface ExtraField {
  /** Always starts with OWN_PREFIX, so it never collides with a built-in attribute. */
  key: string;
  label: string;
  type: "text" | "choice";
  options: string[];
}

export type OwnFieldKind = "nodes" | "edges";

export interface ExtraFields {
  nodes: Record<string, ExtraField[]>;
  edges: Record<string, ExtraField[]>;
}

export interface DomainLists {
  disabled: string[];
  custom: CustomList[];
  extra_fields?: ExtraFields;
}

export const OWN_PREFIX = "x_";

/** Is this attribute one of the fields an admin added? */
export const isOwnField = (key: string) => key.startsWith(OWN_PREFIX);

/** The own fields of one object type or connection type. */
export function ownFieldsFor(lists: DomainLists | undefined, kind: OwnFieldKind, type: string): ExtraField[] {
  return lists?.extra_fields?.[kind]?.[type] ?? [];
}

/** The label of an own field, whichever type it sits on; undefined for any other attribute. */
export function ownFieldLabel(lists: DomainLists | undefined, key: string): string | undefined {
  if (!isOwnField(key)) return undefined;
  const all = [...Object.values(lists?.extra_fields?.nodes ?? {}), ...Object.values(lists?.extra_fields?.edges ?? {})];
  return all.flat().find((f) => f.key === key)?.label;
}

/** A stable key for a new own field: the prefix and a slug with underscores. */
export function ownFieldKey(label: string, taken: string[]): string {
  const base = `${OWN_PREFIX}${slug(label, []).replace(/-/g, "_")}`.slice(0, 44);
  let key = base;
  for (let i = 2; taken.includes(key); i++) key = `${base}_${i}`;
  return key;
}

export const LIST_KEY = "list_key";

/** The built-in lists that can be switched off, and the page each one has. */
export const OPTIONAL_LISTS: { type: NodeType; path: string; labelKey: string; domain: DomainKey }[] = [
  { type: "InformationSource", path: "/info-sources", labelKey: "nav.infoSources", domain: "information" },
  { type: "TechnologyComponent", path: "/tech-components", labelKey: "nav.techComponents", domain: "technology" },
  { type: "Server", path: "/servers", labelKey: "nav.servers", domain: "technology" },
  { type: "ServerService", path: "/server-services", labelKey: "nav.serverServices", domain: "technology" },
];

export const DOMAINS: { key: DomainKey; labelKey: string }[] = [
  { key: "business", labelKey: "nav.domain.business" },
  { key: "information", labelKey: "nav.domain.information" },
  { key: "application", labelKey: "nav.domain.application" },
  { key: "technology", labelKey: "nav.domain.technology" },
];

export const listPath = (key: string) => `/lists/${key}`;

/** A stable key for a new list or field; ours to keep once objects point at it. */
export function slug(name: string, taken: string[]): string {
  const base = name
    .toLowerCase()
    .replace(/å|ä/g, "a")
    .replace(/ö/g, "o")
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "lista";
  let key = base;
  for (let i = 2; taken.includes(key); i++) key = `${base}-${i}`;
  return key;
}

/** Is the page on? Switched-off lists stay closed, even from a bookmark. */
export function listPathEnabled(path: string, lists: DomainLists | undefined): boolean {
  if (!lists) return true;
  const builtin = OPTIONAL_LISTS.find((l) => path === l.path || path.startsWith(`${l.path}/`));
  if (builtin) return !lists.disabled.includes(builtin.type);
  if (path.startsWith("/lists/")) {
    const key = path.slice("/lists/".length).split("/")[0];
    return lists.custom.some((c) => c.key === key && c.active);
  }
  return true;
}
