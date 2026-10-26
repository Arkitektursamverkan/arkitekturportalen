/**
 * Optional modules (backend app/modules.py): which pages belong to which.
 *
 * A page under a switched-off module is left out of the menu, the shortcuts
 * and the router; its API answers 404 anyway. Everything not listed here is
 * the core and always shown.
 */
export type ModuleKey = "calendar" | "collaboration" | "governance" | "glossary" | "surveys" | "changes" | "arkitekten";

/**
 * Arkitekten (module "arkitekten") has no pages here: it is its own service,
 * and the portal shows its process diagrams in the process explorer and links
 * to it from the top bar (ARKITEKTEN_URL, via /config.js).
 */
export const ARKITEKTEN_URL = (window.__EA_CONFIG__?.arkitektenUrl || import.meta.env.VITE_ARKITEKTEN_URL || "").replace(/\/+$/, "");

// Path prefixes, longest first is not needed: no prefix here contains another.
const MODULE_PATHS: [string, ModuleKey][] = [
  ["/business-calendar", "calendar"],
  ["/uppdrag", "collaboration"],
  ["/arbetsgrupper", "collaboration"],
  ["/architecture-principles", "governance"],
  ["/target-architecture", "governance"],
  ["/nulaagesanalys", "governance"],
  ["/gap-analys", "governance"],
  ["/reports/principles", "governance"],
  ["/reports/gap-progress", "governance"],
  ["/glossary", "glossary"],
  ["/surveys", "surveys"],
  ["/my-surveys", "surveys"],
  ["/s/", "surveys"],
  ["/reports/published/", "surveys"],
  ["/reports/changes", "changes"],
];

/** The module a page belongs to, or null for the core. */
export function moduleForPath(path: string): ModuleKey | null {
  for (const [prefix, key] of MODULE_PATHS) {
    if (prefix.endsWith("/") ? path.startsWith(prefix) : path === prefix || path.startsWith(`${prefix}/`)) {
      return key;
    }
  }
  return null;
}
