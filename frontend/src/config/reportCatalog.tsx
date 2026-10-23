import React from "react";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import AnalyticsIcon from "@mui/icons-material/Analytics";
import AssessmentIcon from "@mui/icons-material/Assessment";
import DashboardIcon from "@mui/icons-material/Dashboard";
import DnsIcon from "@mui/icons-material/Dns";
import GridOnIcon from "@mui/icons-material/GridOn";
import HistoryIcon from "@mui/icons-material/History";
import HubIcon from "@mui/icons-material/Hub";
import InventoryIcon from "@mui/icons-material/Inventory";
import ListAltIcon from "@mui/icons-material/ListAlt";
import MemoryIcon from "@mui/icons-material/Memory";
import OutlinedFlagIcon from "@mui/icons-material/OutlinedFlag";
import PeopleIcon from "@mui/icons-material/People";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

/**
 * The built-in reports, in one place.
 *
 * These pages have no database rows — `key` is what a report tag links to, and
 * it is the path segment after `/reports/` so the two can never drift apart.
 * The sidebar, the /reports overview and the Home-shortcut registry all read
 * this list; adding a report means one entry here plus a route.
 */
export interface ReportMeta {
  /** Stable tag key. Same as the last segment of `path`. */
  key: string;
  path: string;
  /** Short label — the menu entry and the card heading. */
  labelKey: string;
  /** One sentence on what the report answers. Empty when none is translated. */
  descKey: string;
  icon: React.ReactNode;
}

const meta = (
  key: string,
  labelKey: string,
  descSlug: string,
  icon: React.ReactNode,
): ReportMeta => ({
  key,
  path: `/reports/${key}`,
  labelKey,
  descKey: `reports.${descSlug}.description`,
  icon,
});

export const REPORT_CATALOG: ReportMeta[] = [
  meta("maturity", "nav.reportMaturity", "maturity", <DashboardIcon />),
  meta("process-support", "nav.reportProcessSupport", "processSupport", <GridOnIcon />),
  meta("portfolio", "nav.reportPortfolio", "portfolio", <ListAltIcon />),
  meta("redundancy", "nav.reportRedundancy", "redundancy", <WarningAmberIcon />),
  meta("overlap-gaps", "nav.reportOverlapGaps", "overlapGaps", <AnalyticsIcon />),
  meta("owners", "nav.reportOwners", "owners", <PeopleIcon />),
  meta("integrations", "nav.reportIntegrations", "integrations", <HubIcon />),
  meta("vendors", "nav.reportVendors", "vendors", <InventoryIcon />),
  meta("classification", "nav.reportClassification", "classification", <GridOnIcon />),
  meta("hosting", "nav.reportHosting", "hosting", <DnsIcon />),
  meta("lifecycle", "nav.reportLifecycle", "lifecycle", <HistoryIcon />),
  meta("risk", "nav.reportRisk", "risk", <WarningAmberIcon />),
  meta("bia", "nav.reportBIA", "bia", <AssessmentIcon />),
  meta("nis2", "nav.reportNIS2", "nis2", <WarningAmberIcon />),
  meta("gdpr", "nav.reportGDPR", "gdpr", <ListAltIcon />),
  meta("auth", "nav.reportAuth", "auth", <PeopleIcon />),
  meta("tech-debt", "nav.reportTechDebt", "techDebt", <MemoryIcon />),
  meta("tech-vendors", "nav.reportTechVendors", "techVendors", <InventoryIcon />),
  meta("tech-portfolio", "nav.reportTechPortfolio", "techPortfolio", <GridOnIcon />),
  meta("costs", "nav.reportCosts", "costs", <InventoryIcon />),
  meta("roadmap", "nav.reportRoadmap", "roadmap", <HubIcon />),
  meta("gap-progress", "nav.reportGapProgress", "gapProgress", <AnalyticsIcon />),
  meta("manual-objects", "nav.reportManualObjects", "manualObjects", <AddCircleOutlineIcon />),
  meta("flagged-objects", "nav.reportFlaggedObjects", "flaggedObjects", <OutlinedFlagIcon />),
];

export const PUBLISHED_PREFIX = "/reports/published/";

/** Published survey editions are tagged too, under a namespaced key. */
export function publishedReportKey(id: string): string {
  return `published:${id}`;
}

const BY_PATH = new Map(REPORT_CATALOG.map((r) => [r.path, r]));

export function getReport(path: string): ReportMeta | undefined {
  return BY_PATH.get(path);
}

/** The tag key of the report a path points at, or null if it is not a report. */
export function reportKeyForPath(path: string): string | null {
  if (path.startsWith(PUBLISHED_PREFIX)) {
    const id = path.slice(PUBLISHED_PREFIX.length);
    return id ? publishedReportKey(id) : null;
  }
  return BY_PATH.get(path)?.key ?? null;
}
