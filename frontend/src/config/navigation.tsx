/**
 * The left menu: what an admin can arrange (Administration → Meny), and the
 * standard arrangement. Stored in the organisation settings
 * (backend app/schemas/navigation.py); null there means STANDARD_NAV.
 *
 * - A block draws itself from data (Domän from the object types, Samarbete
 *   from the user's uppdrag, Rapporter from the catalogue …). It can be moved,
 *   not taken apart.
 * - A group is a folding heading over pages from PAGE_CATALOG.
 * - An item is one page from PAGE_CATALOG at the top level.
 *
 * Pages under a switched-off module are hidden as everywhere else, and a
 * group with nothing visible is not drawn.
 */
import React from "react";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import AnalyticsIcon from "@mui/icons-material/Analytics";
import AssessmentIcon from "@mui/icons-material/Assessment";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import BuildIcon from "@mui/icons-material/Build";
import DrawIcon from "@mui/icons-material/Draw";
import FlagIcon from "@mui/icons-material/Flag";
import FolderIcon from "@mui/icons-material/Folder";
import GavelIcon from "@mui/icons-material/Gavel";
import GroupsIcon from "@mui/icons-material/Groups";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import RouteIcon from "@mui/icons-material/Route";
import StarIcon from "@mui/icons-material/Star";

export type NavBlockKey = "home" | "calendar" | "domains" | "collaboration" | "reports" | "admin";
export type NavGroupIcon =
  | "account_balance" | "folder" | "gavel" | "flag" | "route" | "menu_book" | "groups" | "build" | "star"
  | "lightbulb";

export type NavEntry =
  | { type: "block"; key: NavBlockKey }
  | { type: "group"; id: string; label: string; icon: NavGroupIcon; items: string[] }
  | { type: "item"; path: string };

export interface Navigation {
  entries: NavEntry[];
}

/** The blocks in their standard order, with the names the admin page shows. */
export const NAV_BLOCKS: { key: NavBlockKey; labelKey: string; fallback: string }[] = [
  { key: "home", labelKey: "nav.home", fallback: "Hem" },
  { key: "calendar", labelKey: "nav.businessCalendar", fallback: "Verksamhetskalender" },
  { key: "domains", labelKey: "nav.explorer", fallback: "IT-landskapet" },
  { key: "collaboration", labelKey: "nav.collaboration", fallback: "Samarbete" },
  { key: "reports", labelKey: "nav.reports", fallback: "Rapporter" },
  { key: "admin", labelKey: "nav.dataManagementGroup", fallback: "Administration" },
];

/** Pages an admin can place in a group or on their own. */
export const PAGE_CATALOG: Record<string, { labelKey: string; icon: React.ReactElement }> = {
  "/architecture-principles": { labelKey: "nav.architecturePrinciples", icon: <GavelIcon /> },
  "/target-architecture": { labelKey: "nav.targetArchitecture", icon: <FlagIcon /> },
  "/nulaagesanalys": { labelKey: "nav.nulaagesanalys", icon: <AssessmentIcon /> },
  "/gap-analys": { labelKey: "nav.gapAnalys", icon: <AnalyticsIcon /> },
  "/arkitekturresan": { labelKey: "nav.architectureJourney", icon: <RouteIcon /> },
  "/solution-sketches": { labelKey: "nav.solutionSketches", icon: <DrawIcon /> },
  "/glossary": { labelKey: "nav.glossary", icon: <MenuBookIcon /> },
  "/my-surveys": { labelKey: "nav.mySurveys", icon: <AssignmentTurnedInIcon /> },
};

export const GROUP_ICONS: Record<NavGroupIcon, React.ReactElement> = {
  account_balance: <AccountBalanceIcon />,
  folder: <FolderIcon />,
  gavel: <GavelIcon />,
  flag: <FlagIcon />,
  route: <RouteIcon />,
  menu_book: <MenuBookIcon />,
  groups: <GroupsIcon />,
  build: <BuildIcon />,
  star: <StarIcon />,
  lightbulb: <LightbulbIcon />,
};

/** The menu as it has always looked. */
export const STANDARD_NAV: NavEntry[] = [
  { type: "block", key: "home" },
  { type: "block", key: "calendar" },
  { type: "block", key: "domains" },
  {
    type: "group", id: "arkitekturstyrning", label: "Arkitekturstyrning", icon: "account_balance",
    items: ["/architecture-principles", "/target-architecture"],
  },
  { type: "block", key: "collaboration" },
  { type: "block", key: "reports" },
  { type: "item", path: "/glossary" },
  { type: "item", path: "/my-surveys" },
  { type: "block", key: "admin" },
];

/**
 * A stored menu made safe to draw: unknown blocks and pages are dropped, each
 * block and page appears once, and a block missing from the stored menu (one
 * added in a later version, say) is put back in its standard place at the end.
 */
export function normalizeNav(stored: Navigation | null | undefined): NavEntry[] {
  if (!stored) return STANDARD_NAV;
  const blocks = new Set<NavBlockKey>();
  const pages = new Set<string>();
  const known = new Set(NAV_BLOCKS.map((b) => b.key));
  const takePage = (p: string) => {
    if (!(p in PAGE_CATALOG) || pages.has(p)) return false;
    pages.add(p);
    return true;
  };
  const out: NavEntry[] = [];
  for (const e of stored.entries) {
    if (e.type === "block") {
      if (known.has(e.key) && !blocks.has(e.key)) {
        blocks.add(e.key);
        out.push(e);
      }
    } else if (e.type === "group") {
      out.push({ ...e, items: e.items.filter(takePage) });
    } else if (takePage(e.path)) {
      out.push(e);
    }
  }
  for (const b of NAV_BLOCKS) if (!blocks.has(b.key)) out.push({ type: "block", key: b.key });
  return out;
}
