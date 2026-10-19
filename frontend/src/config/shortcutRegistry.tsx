import React from "react";
import HomeIcon from "@mui/icons-material/Home";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import StorageIcon from "@mui/icons-material/Storage";
import DescriptionIcon from "@mui/icons-material/Description";
import SourceIcon from "@mui/icons-material/Source";
import MemoryIcon from "@mui/icons-material/Memory";
import MapIcon from "@mui/icons-material/Map";
import GavelIcon from "@mui/icons-material/Gavel";
import FlagIcon from "@mui/icons-material/Flag";
import DeviceHubIcon from "@mui/icons-material/DeviceHub";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import AnalyticsIcon from "@mui/icons-material/Analytics";
import DnsIcon from "@mui/icons-material/Dns";
import SettingsEthernetIcon from "@mui/icons-material/SettingsEthernet";
import AssessmentIcon from "@mui/icons-material/Assessment";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import GroupWorkIcon from "@mui/icons-material/GroupWork";
import Diversity3Icon from "@mui/icons-material/Diversity3";
import { REPORT_CATALOG } from "./reportCatalog";

export interface ShortcutMeta {
  path: string;
  labelKey: string;
  icon: React.ReactNode;
}

/**
 * All paths a user can pin as a Home shortcut. Mirrors the navigation in
 * AppShell — keep in sync when routes are added/renamed. Excluded by intent:
 * /settings, /users, /audit-log, /sync-profiles, /data-management,
 * /import, /platform-import (administrative flows, not browse targets).
 */
export const SHORTCUT_REGISTRY: ShortcutMeta[] = [
  { path: "/", labelKey: "nav.home", icon: <HomeIcon /> },
  { path: "/processes", labelKey: "nav.processExplorer", icon: <AccountTreeIcon /> },
  { path: "/business-calendar", labelKey: "nav.businessCalendar", icon: <CalendarMonthIcon /> },
  { path: "/systems", labelKey: "nav.systemView", icon: <StorageIcon /> },
  { path: "/info-objects", labelKey: "nav.infoObjects", icon: <DescriptionIcon /> },
  { path: "/info-sources", labelKey: "nav.infoSources", icon: <SourceIcon /> },
  { path: "/tech-components", labelKey: "nav.techComponents", icon: <MemoryIcon /> },
  { path: "/servers", labelKey: "nav.servers", icon: <DnsIcon /> },
  { path: "/server-services", labelKey: "nav.serverServices", icon: <SettingsEthernetIcon /> },
  { path: "/landscape", labelKey: "nav.landscape", icon: <MapIcon /> },
  { path: "/nulaagesanalys", labelKey: "nav.nulaagesanalys", icon: <AssessmentIcon /> },
  { path: "/gap-analys", labelKey: "nav.gapAnalys", icon: <AnalyticsIcon /> },
  { path: "/architecture-principles", labelKey: "nav.architecturePrinciples", icon: <GavelIcon /> },
  { path: "/target-architecture", labelKey: "nav.targetArchitecture", icon: <FlagIcon /> },
  { path: "/connections", labelKey: "nav.connections", icon: <DeviceHubIcon /> },
  { path: "/create", labelKey: "nav.create", icon: <AddCircleOutlineIcon /> },
  // Every built-in report, straight from the catalog — one list, no drift.
  ...REPORT_CATALOG.map((r) => ({ path: r.path, labelKey: r.labelKey, icon: r.icon })),
  { path: "/glossary", labelKey: "nav.glossary", icon: <MenuBookIcon /> },
  { path: "/uppdrag", labelKey: "nav.assignments", icon: <GroupWorkIcon /> },
  { path: "/arbetsgrupper", labelKey: "nav.workgroups", icon: <Diversity3Icon /> },
];

const PATH_INDEX = new Map(SHORTCUT_REGISTRY.map((s) => [s.path, s]));

export function getShortcut(path: string): ShortcutMeta | undefined {
  return PATH_INDEX.get(path);
}

export const SHORTCUT_DRAG_MIME = "application/x-ea-shortcut-path";
