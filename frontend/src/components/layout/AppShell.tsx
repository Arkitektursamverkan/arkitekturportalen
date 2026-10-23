import React, { useState } from "react";
import {
  Box, Collapse, Drawer, List, ListItemButton, ListItemIcon,
  ListItemText, Toolbar, Typography, Divider, SvgIcon,
} from "@mui/material";
import HomeIcon from "@mui/icons-material/Home";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import StorageIcon from "@mui/icons-material/Storage";
import MapIcon from "@mui/icons-material/Map";
import DescriptionIcon from "@mui/icons-material/Description";
import SourceIcon from "@mui/icons-material/Source";
import MemoryIcon from "@mui/icons-material/Memory";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import SyncAltIcon from "@mui/icons-material/SyncAlt";
import BuildIcon from "@mui/icons-material/Build";
import HistoryIcon from "@mui/icons-material/History";
import MenuOpenIcon from "@mui/icons-material/MenuOpen";
import AssessmentIcon from "@mui/icons-material/Assessment";
import DeviceHubIcon from "@mui/icons-material/DeviceHub";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import BusinessIcon from "@mui/icons-material/Business";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import AppsIcon from "@mui/icons-material/Apps";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import DnsIcon from "@mui/icons-material/Dns";
import SettingsEthernetIcon from "@mui/icons-material/SettingsEthernet";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import LogoutIcon from "@mui/icons-material/Logout";
import PollIcon from "@mui/icons-material/Poll";
import LabelOutlinedIcon from "@mui/icons-material/LabelOutlined";
import SortByAlphaIcon from "@mui/icons-material/SortByAlpha";
import GroupIcon from "@mui/icons-material/Group";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import GroupWorkIcon from "@mui/icons-material/GroupWork";
import AssignmentIcon from "@mui/icons-material/Assignment";
import Diversity3Icon from "@mui/icons-material/Diversity3";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import TopBar from "./TopBar";
import BannerStack from "./BannerStack";
import SurveyNagDialog from "./SurveyNagDialog";
import RandomSurveyDialog from "./RandomSurveyDialog";
import { useUiStore } from "@/store/uiStore";
import { useRoleStore } from "@/store/roleStore";
import { publishedDate, usePublishedReports } from "@/api/publishedReports";
import { useWorkspaces } from "@/api/workspaces";
import { useModules, usePublicOrgSettings } from "@/api/orgSettings";
import {
  GROUP_ICONS, PAGE_CATALOG, normalizeNav, type NavBlockKey, type NavEntry,
} from "@/config/navigation";
import NodeDetailPanel from "@/components/graph/NodeDetailPanel";
import DomainOverviewDialog from "./DomainOverviewDialog";
import { SHORTCUT_DRAG_MIME } from "@/config/shortcutRegistry";
import {
  PUBLISHED_PREFIX,
  REPORT_CATALOG,
  publishedReportKey,
  reportKeyForPath,
} from "@/config/reportCatalog";
import ReportTagBar from "@/components/reports/ReportTagBar";
import { groupByTag, useReportTags } from "@/api/reportTags";
import { useReportNames } from "@/api/reportNames";

const DRAWER_WIDTH = 220;

// BDAT Triangle icon (Business, Data, Application, Technology)
const BdatIcon: React.FC<{ fontSize?: "small" | "inherit" | "medium" | "large"; sx?: object }> = ({ fontSize, sx }) => (
  <SvgIcon fontSize={fontSize} sx={sx} viewBox="0 0 24 24">
    {/* Triangle */}
    <polygon points="12,2 22,20 2,20" fill="none" stroke="currentColor" strokeWidth="1.5" />
    {/* Horizontal lines dividing into 4 layers */}
    <line x1="5.5" y1="11" x2="18.5" y2="11" stroke="currentColor" strokeWidth="1" />
    <line x1="3.7" y1="15.5" x2="20.3" y2="15.5" stroke="currentColor" strokeWidth="1" />
    <line x1="7.3" y1="6.5" x2="16.7" y2="6.5" stroke="currentColor" strokeWidth="1" />
    {/* Layer labels */}
    <text x="12" y="5.8" textAnchor="middle" fontSize="2.8" fill="currentColor" fontWeight="700">B</text>
    <text x="12" y="10" textAnchor="middle" fontSize="2.8" fill="currentColor" fontWeight="700">D</text>
    <text x="12" y="14.5" textAnchor="middle" fontSize="2.8" fill="currentColor" fontWeight="700">A</text>
    <text x="12" y="19" textAnchor="middle" fontSize="2.8" fill="currentColor" fontWeight="700">T</text>
  </SvgIcon>
);

interface NavItem {
  path: string;
  icon: React.ReactNode;
  key: string;
  adminOnly: boolean;
  editorOnly?: boolean;
  /** Shown only to users with at least read access to Servrar. */
  serversOnly?: boolean;
}

// TOGAF domain groups
interface DomainGroup {
  key: string;           // translation key for group label
  icon: React.ReactNode;
  color: string;
  items: NavItem[];
}

const DOMAIN_GROUPS: DomainGroup[] = [
  {
    key: "nav.domain.business",
    icon: <BusinessIcon />,
    color: "#4CAF50",
    items: [
      { path: "/processes", icon: <AccountTreeIcon />, key: "nav.processExplorer", adminOnly: false },
    ],
  },
  {
    key: "nav.domain.application",
    icon: <AppsIcon />,
    color: "#2196F3",
    items: [
      { path: "/systems", icon: <StorageIcon />, key: "nav.systemView", adminOnly: false },
      { path: "/landscape", icon: <MapIcon />, key: "nav.landscape", adminOnly: false },
    ],
  },
  {
    key: "nav.domain.information",
    icon: <FolderOpenIcon />,
    color: "#FF9800",
    items: [
      { path: "/info-objects", icon: <DescriptionIcon />, key: "nav.infoObjects", adminOnly: false },
      { path: "/info-sources", icon: <SourceIcon />, key: "nav.infoSources", adminOnly: false },
    ],
  },
  {
    key: "nav.domain.technology",
    icon: <DnsIcon />,
    color: "#9C27B0",
    items: [
      { path: "/tech-components", icon: <MemoryIcon />, key: "nav.techComponents", adminOnly: false },
      { path: "/servers", icon: <DnsIcon />, key: "nav.servers", adminOnly: false, serversOnly: true },
      { path: "/server-services", icon: <SettingsEthernetIcon />, key: "nav.serverServices", adminOnly: false, serversOnly: true },
    ],
  },
];

const ALL_DOMAIN_PATHS = new Set(DOMAIN_GROUPS.flatMap((g) => g.items.map((i) => i.path)));

// A page from the menu settings' catalogue, as a menu row.
const catalogItem = (path: string): NavItem => ({
  path,
  icon: PAGE_CATALOG[path]?.icon ?? <DescriptionIcon />,
  key: PAGE_CATALOG[path]?.labelKey ?? path,
  adminOnly: false,
});

// Editors see the first two (survey authoring, object creation); the rest
// are admin-only. The group itself renders for anyone who can see at least
// one item in it, so editors keep sidebar access to their tools.
const ADMIN_GROUP_ITEMS: NavItem[] = [
  { path: "/surveys", icon: <PollIcon />, key: "nav.surveys", adminOnly: false, editorOnly: true },
  { path: "/create", icon: <AddCircleOutlineIcon />, key: "nav.create", adminOnly: false, editorOnly: true },
  { path: "/connections", icon: <DeviceHubIcon />, key: "nav.connections", adminOnly: false, editorOnly: true },
  { path: "/org-settings", icon: <BusinessIcon />, key: "nav.orgSettings", adminOnly: true },
  { path: "/navigation-settings", icon: <MenuOpenIcon />, key: "nav.navigationSettings", adminOnly: true },
  { path: "/users", icon: <GroupIcon />, key: "nav.userManagement", adminOnly: true },
  { path: "/access", icon: <AdminPanelSettingsIcon />, key: "nav.accessManagement", adminOnly: true },
  { path: "/data-management", icon: <DeleteSweepIcon />, key: "nav.adminFunctions", adminOnly: true },
  { path: "/sync-profiles", icon: <SyncAltIcon />, key: "nav.syncProfiles", adminOnly: true },
  { path: "/platform-import", icon: <SyncAltIcon />, key: "nav.platformImport", adminOnly: true },
  { path: "/import", icon: <UploadFileIcon />, key: "nav.import", adminOnly: true },
  { path: "/audit-log", icon: <HistoryIcon />, key: "settings.tabs.auditLog", adminOnly: true },
];

const ALL_ADMIN_GROUP_PATHS = new Set(ADMIN_GROUP_ITEMS.map((i) => i.path));

// The reports themselves live in the catalog; the sidebar only needs the
// three fields a menu row uses.
const REPORT_ITEMS: NavItem[] = REPORT_CATALOG.map((r) => ({
  path: r.path,
  icon: r.icon,
  key: r.labelKey,
  adminOnly: false,
}));

const ALL_REPORT_PATHS = new Set(REPORT_ITEMS.map((i) => i.path));

// One row in the Rapporter menu — a built-in report or a published edition.
interface ReportEntry {
  /** Tag key: the report slug, or "published:<uuid>". */
  key: string;
  path: string;
  label: string;
  secondary?: string;
  icon: React.ReactNode;
}

const REPORT_GROUPING_KEY = "ea_reports_grouping";

// Samarbete: the sub-items come from the API rather than from a static list —
// the uppdrag the user belongs to, and the standing arbetsgrupper (which are
// internal, so everyone sees all of them).
const WORKSPACES_PATH = "/uppdrag";
const WORKGROUPS_PATH = "/arbetsgrupper";

interface Props {
  children: React.ReactNode;
}

const AppShell: React.FC<Props> = ({ children }) => {
  const { t, i18n } = useTranslation();
  const { sidebarOpen } = useUiStore();
  const { isAdmin, isEditor, serverAccess } = useRoleStore();
  const navigate = useNavigate();
  const location = useLocation();

  const isDomainActive = ALL_DOMAIN_PATHS.has(location.pathname);
  const [domainOpen, setDomainOpen] = useState(isDomainActive);
  // Clicking "Domän" itself opens the full-screen BDAT summary; the chevron
  // is what folds the sub-menu away. The dialog is only mounted once it has
  // been opened, so its node/target-architecture queries don't run on every
  // page; it stays mounted afterwards to keep the close animation.
  const [domainOverviewOpen, setDomainOverviewOpen] = useState(false);
  const [domainOverviewMounted, setDomainOverviewMounted] = useState(false);

  // The menu as the admin arranged it (or the standard one); groups fold
  // open on their own when one of their pages is shown.
  const { data: publicSettings } = usePublicOrgSettings();
  const navEntries = React.useMemo(() => normalizeNav(publicSettings?.navigation), [publicSettings?.navigation]);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const isDataMgmtActive = ALL_ADMIN_GROUP_PATHS.has(location.pathname);
  const [dataMgmtOpen, setDataMgmtOpen] = useState(isDataMgmtActive);

  const isWorkspaceActive =
    location.pathname === WORKSPACES_PATH ||
    location.pathname.startsWith(`${WORKSPACES_PATH}/`) ||
    location.pathname === WORKGROUPS_PATH ||
    location.pathname.startsWith(`${WORKGROUPS_PATH}/`);
  const { enabled: moduleOn, pathEnabled } = useModules();
  const { data: workspaces } = useWorkspaces(undefined, moduleOn("collaboration"));
  // Only the uppdrag the user is actually a member of are listed; the rest are
  // one click away in the uppdrag list.
  const myWorkspaces = (workspaces ?? []).filter(
    (w) => w.kind === "uppdrag" && w.is_member && w.status === "active",
  );
  // Every arbetsgrupp is listed — they are internal, so everyone may read them.
  const workgroups = (workspaces ?? []).filter(
    (w) => w.kind === "arbetsgrupp" && w.status === "active",
  );
  const [workspacesOpen, setWorkspacesOpen] = useState(isWorkspaceActive);

  const isReportActive =
    ALL_REPORT_PATHS.has(location.pathname) || location.pathname.startsWith(PUBLISHED_PREFIX);
  // Editions published from the survey tool. Editor-only, like the surveys.
  const { data: publishedReports } = usePublishedReports(isEditor && moduleOn("surveys"));
  const { data: reportTags } = useReportTags();
  const { data: reportNames } = useReportNames();
  const [reportsOpen, setReportsOpen] = useState(isReportActive);
  // Grouped by tag is the default; A-O is the flat fallback for anyone who
  // knows the report by name. Remembered per browser, like the language.
  const [groupReports, setGroupReports] = useState(
    () => localStorage.getItem(REPORT_GROUPING_KEY) !== "alpha",
  );
  const toggleReportGrouping = () =>
    setGroupReports((on) => {
      localStorage.setItem(REPORT_GROUPING_KEY, on ? "alpha" : "tag");
      return !on;
    });

  // Published editions and built-in reports are one list here: both carry tags,
  // so both group the same way. Published first, then the built-ins A-O.
  const reportEntries = React.useMemo<ReportEntry[]>(() => {
    const published = (publishedReports ?? []).map((pub) => ({
      key: publishedReportKey(pub.id),
      path: `${PUBLISHED_PREFIX}${pub.id}`,
      label: reportNames?.get(publishedReportKey(pub.id)) ?? pub.name,
      secondary: publishedDate(pub.published_at),
      icon: <PollIcon fontSize="small" />,
    }));
    const builtin = REPORT_ITEMS.filter((item) => pathEnabled(item.path)).map((item) => {
      const key = item.path.slice("/reports/".length);
      return {
        key,
        path: item.path,
        label: reportNames?.get(key) ?? t(item.key),
        icon: item.icon,
      };
    }).sort((a, b) => a.label.localeCompare(b.label, i18n.language));
    return [...published, ...builtin];
  }, [publishedReports, reportNames, t, i18n.language, pathEnabled]);

  const reportGroups = React.useMemo(
    () => groupByTag(reportEntries, (e) => e.key, reportTags),
    [reportEntries, reportTags],
  );

  // Null on every page that is not a report, which is what hides the tag bar.
  const currentReportKey = reportKeyForPath(location.pathname);

  const flatReportEntries = React.useMemo(
    () => [...reportEntries].sort((a, b) => a.label.localeCompare(b.label, i18n.language)),
    [reportEntries, i18n.language],
  );

  // Auto-expand menus when navigating to their pages
  React.useEffect(() => {
    if (isDomainActive) setDomainOpen(true);
  }, [isDomainActive]);
  React.useEffect(() => {
    if (isDataMgmtActive) setDataMgmtOpen(true);
  }, [isDataMgmtActive]);
  React.useEffect(() => {
    if (isReportActive) setReportsOpen(true);
  }, [isReportActive]);
  React.useEffect(() => {
    if (isWorkspaceActive) setWorkspacesOpen(true);
  }, [isWorkspaceActive]);

  const filterAdmin = (items: NavItem[]) =>
    items.filter((i) => {
      if (!pathEnabled(i.path)) return false;
      if (i.serversOnly && serverAccess === "none") return false;
      if (i.adminOnly) return isAdmin;
      if (i.editorOnly) return isEditor;
      return true;
    });

  const visibleAdminItems = filterAdmin(ADMIN_GROUP_ITEMS);

  // One report row. Shared by both groupings so they stay identical apart
  // from the order, and draggable to Home like every other nav item.
  const renderReportEntry = (entry: ReportEntry) => (
    <ListItemButton
      key={entry.path}
      selected={location.pathname === entry.path}
      onClick={() => navigate(entry.path)}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(SHORTCUT_DRAG_MIME, entry.path);
        e.dataTransfer.effectAllowed = "copy";
      }}
      sx={{ borderRadius: 1, mx: 0.5, my: 0.15, pl: 4 }}
    >
      <ListItemIcon sx={{ minWidth: 30, color: "#E65100" }}>{entry.icon}</ListItemIcon>
      <ListItemText
        primary={entry.label}
        secondary={entry.secondary}
        slotProps={{ primary: { sx: { fontSize: 12 } }, secondary: { sx: { fontSize: 10 } } }} />
    </ListItemButton>
  );

  const renderItem = (item: NavItem, indent = 0) => (
    <ListItemButton
      key={item.path}
      selected={location.pathname === item.path}
      onClick={() => navigate(item.path)}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(SHORTCUT_DRAG_MIME, item.path);
        e.dataTransfer.effectAllowed = "copy";
      }}
      sx={{ borderRadius: 1, mx: 0.5, my: 0.25, pl: indent || undefined }}
    >
      <ListItemIcon sx={{ minWidth: 36, color: "primary.main" }}>{item.icon}</ListItemIcon>
      <ListItemText primary={t(item.key)} slotProps={{ primary: { sx: { fontSize: 13 } } }} />
    </ListItemButton>
  );

  // ── The menu's blocks (config/navigation.tsx): each draws itself from data ──
  const renderBlock = (key: NavBlockKey): React.ReactNode => {
    switch (key) {
      case "home":
        return (
          <React.Fragment key="block-home">
            {/* Home */}
            <ListItemButton
              selected={location.pathname === "/"}
              onClick={() => navigate("/")}
              sx={{ borderRadius: 1, mx: 0.5, my: 0.25 }}
            >
              <ListItemIcon sx={{ minWidth: 36, color: "primary.main" }}><HomeIcon /></ListItemIcon>
              <ListItemText primary={t("nav.home")} slotProps={{ primary: { sx: { fontSize: 13 } } }} />
            </ListItemButton>
          </React.Fragment>
        );
      case "calendar":
        return (
          <React.Fragment key="block-calendar">
            {/* Verksamhetskalender – for everyone, so it sits at the top rather than in a group */}
            {moduleOn("calendar") && (
            <ListItemButton
              selected={location.pathname === "/business-calendar"}
              onClick={() => navigate("/business-calendar")}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(SHORTCUT_DRAG_MIME, "/business-calendar");
                e.dataTransfer.effectAllowed = "copy";
              }}
              sx={{ borderRadius: 1, mx: 0.5, my: 0.25 }}
            >
              <ListItemIcon sx={{ minWidth: 36, color: "primary.main" }}><CalendarMonthIcon /></ListItemIcon>
              <ListItemText primary={t("nav.businessCalendar")} slotProps={{ primary: { sx: { fontSize: 13 } } }} />
            </ListItemButton>
            )}
          </React.Fragment>
        );
      case "domains":
        return (
          <React.Fragment key="block-domains">
            {/* Domän (BDAT) group */}
            <ListItemButton
              onClick={() => {
                setDomainOpen(true);
                setDomainOverviewMounted(true);
                setDomainOverviewOpen(true);
              }}
              sx={{ borderRadius: 1, mx: 0.5, my: 0.25 }}
            >
              <ListItemIcon sx={{ minWidth: 36, color: "#E65100" }}>
                <BdatIcon fontSize="medium" sx={{ color: "#E65100 !important" }} />
              </ListItemIcon>
              <ListItemText
                primary={t("nav.explorer")}
                slotProps={{ primary: { sx: { fontSize: 13, fontWeight: isDomainActive ? 600 : 400 } } }}
              />
              <Box
                component="span"
                onClick={(e) => {
                  e.stopPropagation();
                  setDomainOpen((o) => !o);
                }}
                sx={{ display: "flex", alignItems: "center", p: 0.25, borderRadius: 1, "&:hover": { bgcolor: "action.hover" } }}
              >
                {domainOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
              </Box>
            </ListItemButton>
            <Collapse in={domainOpen} timeout="auto" unmountOnExit>
              <List dense disablePadding>
                {DOMAIN_GROUPS.map((group) => {
                  const visibleItems = filterAdmin(group.items);
                  if (visibleItems.length === 0) return null;
                  const groupActive = visibleItems.some((i) => location.pathname === i.path);
                  return (
                    <React.Fragment key={group.key}>
                      {/* Domain sub-header */}
                      <ListItemButton
                        sx={{ borderRadius: 1, mx: 0.5, my: 0.25, pl: 3, cursor: "default", "&:hover": { bgcolor: "transparent" } }}
                        disableRipple
                      >
                        <ListItemIcon sx={{ minWidth: 28, color: group.color }}>{group.icon}</ListItemIcon>
                        <ListItemText
                          primary={t(group.key)}
                          slotProps={{
                            primary: { sx: {
                              fontSize: 11,
                              fontWeight: 700,
                              color: groupActive ? "primary.main" : "text.secondary",
                              textTransform: "uppercase",
                              letterSpacing: 0.5,
                            } }
                          }}
                        />
                      </ListItemButton>
                      {/* Domain items */}
                      {visibleItems.map((item) => (
                        <ListItemButton
                          key={item.path}
                          selected={location.pathname === item.path}
                          onClick={() => navigate(item.path)}
                          sx={{ borderRadius: 1, mx: 0.5, my: 0.15, pl: 5 }}
                        >
                          <ListItemIcon sx={{ minWidth: 30, color: group.color }}>{item.icon}</ListItemIcon>
                          <ListItemText primary={t(item.key)} slotProps={{ primary: { sx: { fontSize: 12 } } }} />
                        </ListItemButton>
                      ))}
                    </React.Fragment>
                  );
                })}
              </List>
            </Collapse>
          </React.Fragment>
        );
      case "collaboration":
        return (
          <React.Fragment key="block-collaboration">
            {/* Samarbete — "Uppdrag" leads to the assignment list, with the
                user's own uppdrag listed beneath it */}
            {moduleOn("collaboration") && (isEditor || myWorkspaces.length > 0 || workgroups.length > 0) && (
              <>
                <ListItemButton
                  onClick={() => setWorkspacesOpen((o) => !o)}
                  sx={{ borderRadius: 1, mx: 0.5, my: 0.25 }}
                >
                  <ListItemIcon sx={{ minWidth: 36, color: "primary.main" }}>
                    <GroupWorkIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary={t("nav.collaboration", { defaultValue: "Samarbete" })}
                    slotProps={{ primary: { sx: { fontSize: 13, fontWeight: isWorkspaceActive ? 600 : 400 } } }}
                  />
                  {workspacesOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                </ListItemButton>
                <Collapse in={workspacesOpen} timeout="auto" unmountOnExit>
                  <List dense disablePadding>
                    <ListItemButton
                      selected={location.pathname === WORKGROUPS_PATH}
                      onClick={() => navigate(WORKGROUPS_PATH)}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(SHORTCUT_DRAG_MIME, WORKGROUPS_PATH);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      sx={{ borderRadius: 1, mx: 0.5, my: 0.15, pl: 4 }}
                    >
                      <ListItemIcon sx={{ minWidth: 30, color: "primary.main" }}>
                        <Diversity3Icon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText
                        primary={t("nav.workgroups", { defaultValue: "Arbetsgrupper" })}
                        slotProps={{ primary: { sx: { fontSize: 12 } } }}
                      />
                    </ListItemButton>
                    {workgroups.map((w) => {
                      const path = `${WORKGROUPS_PATH}/${w.id}`;
                      return (
                        <ListItemButton
                          key={w.id}
                          selected={location.pathname === path}
                          onClick={() => navigate(path)}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData(SHORTCUT_DRAG_MIME, path);
                            e.dataTransfer.effectAllowed = "copy";
                          }}
                          sx={{ borderRadius: 1, mx: 0.5, my: 0.15, pl: 6 }}
                        >
                          <ListItemText primary={w.name} slotProps={{ primary: { sx: { fontSize: 12 } } }} />
                        </ListItemButton>
                      );
                    })}

                    <ListItemButton
                      selected={location.pathname === WORKSPACES_PATH}
                      onClick={() => navigate(WORKSPACES_PATH)}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(SHORTCUT_DRAG_MIME, WORKSPACES_PATH);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      sx={{ borderRadius: 1, mx: 0.5, my: 0.15, pl: 4 }}
                    >
                      <ListItemIcon sx={{ minWidth: 30, color: "primary.main" }}>
                        <AssignmentIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText
                        primary={t("nav.assignments", { defaultValue: "Uppdrag" })}
                        slotProps={{ primary: { sx: { fontSize: 12 } } }}
                      />
                    </ListItemButton>
                    {myWorkspaces.map((w) => {
                      const path = `${WORKSPACES_PATH}/${w.id}`;
                      return (
                        <ListItemButton
                          key={w.id}
                          selected={location.pathname === path}
                          onClick={() => navigate(path)}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData(SHORTCUT_DRAG_MIME, path);
                            e.dataTransfer.effectAllowed = "copy";
                          }}
                          sx={{ borderRadius: 1, mx: 0.5, my: 0.15, pl: 6 }}
                        >
                          <ListItemText primary={w.name} slotProps={{ primary: { sx: { fontSize: 12 } } }} />
                        </ListItemButton>
                      );
                    })}
                  </List>
                </Collapse>
              </>
            )}
          </React.Fragment>
        );
      case "reports":
        return (
          <React.Fragment key="block-reports">
            {/* Reports group */}
            <ListItemButton
              onClick={() => setReportsOpen((o) => !o)}
              sx={{ borderRadius: 1, mx: 0.5, my: 0.25 }}
            >
              <ListItemIcon sx={{ minWidth: 36, color: "#E65100" }}>
                <AssessmentIcon />
              </ListItemIcon>
              <ListItemText
                primary={t("nav.reports", { defaultValue: "Rapporter" })}
                slotProps={{ primary: { sx: { fontSize: 13, fontWeight: isReportActive ? 600 : 400 } } }}
              />
              {reportsOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
            </ListItemButton>
            <Collapse in={reportsOpen} timeout="auto" unmountOnExit>
              <List dense disablePadding>
                <ListItemButton
                  onClick={toggleReportGrouping}
                  sx={{ borderRadius: 1, mx: 0.5, mb: 0.5, pl: 3, py: 0.25 }}
                >
                  <ListItemIcon sx={{ minWidth: 30, color: "text.disabled" }}>
                    {groupReports
                      ? <LabelOutlinedIcon sx={{ fontSize: 15 }} />
                      : <SortByAlphaIcon sx={{ fontSize: 15 }} />}
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      groupReports
                        ? t("reports.groupBy.byTag", { defaultValue: "Grupperat på tagg" })
                        : t("reports.groupBy.alphabetical", { defaultValue: "Sorterat A–Ö" })
                    }
                    slotProps={{
                      primary: { sx: {
                        fontSize: 10,
                        color: "text.secondary",
                        letterSpacing: 0.4,
                      } }
                    }}
                  />
                </ListItemButton>

                {groupReports
                  ? reportGroups.map((group) => (
                      <React.Fragment key={group.tag?.id ?? "untagged"}>
                        <ListItemText
                          primary={
                            group.tag?.name ??
                            t("reports.overview.untagged", { defaultValue: "Övrigt" })
                          }
                          sx={{ pl: 3, pr: 1, mt: 1, mb: 0.25 }}
                          slotProps={{
                            primary: { sx: {
                              fontSize: 10,
                              fontWeight: 700,
                              color: group.tag?.color ?? "text.secondary",
                              textTransform: "uppercase",
                              letterSpacing: 0.6,
                            } }
                          }}
                        />
                        {group.items.map((entry) => renderReportEntry(entry))}
                      </React.Fragment>
                    ))
                  : flatReportEntries.map((entry) => renderReportEntry(entry))}
              </List>
            </Collapse>
          </React.Fragment>
        );
      case "admin":
        return (
          <React.Fragment key="block-admin">
            {/* Administration group — visible to anyone who can see at least one item in it */}
            {visibleAdminItems.length > 0 && (
              <>
                <ListItemButton
                  onClick={() => setDataMgmtOpen((o) => !o)}
                  sx={{ borderRadius: 1, mx: 0.5, my: 0.25 }}
                >
                  <ListItemIcon sx={{ minWidth: 36, color: "primary.main" }}>
                    <BuildIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary={t("nav.dataManagementGroup", { defaultValue: "Administration" })}
                    slotProps={{ primary: { sx: { fontSize: 13, fontWeight: isDataMgmtActive ? 600 : 400 } } }}
                  />
                  {dataMgmtOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                </ListItemButton>
                <Collapse in={dataMgmtOpen} timeout="auto" unmountOnExit>
                  <List dense disablePadding>
                    {visibleAdminItems.map((item) => (
                      <ListItemButton
                        key={item.path}
                        selected={location.pathname === item.path}
                        onClick={() => navigate(item.path)}
                        sx={{ borderRadius: 1, mx: 0.5, my: 0.15, pl: 4 }}
                      >
                        <ListItemIcon sx={{ minWidth: 30, color: "primary.main" }}>{item.icon}</ListItemIcon>
                        <ListItemText primary={t(item.key)} slotProps={{ primary: { sx: { fontSize: 12 } } }} />
                      </ListItemButton>
                    ))}
                  </List>
                </Collapse>
              </>
            )}
          </React.Fragment>
        );
    }
  };

  // A group from the menu settings: a folding heading over pages.
  const renderGroup = (group: Extract<NavEntry, { type: "group" }>) => {
    const items = filterAdmin(group.items.map(catalogItem));
    if (items.length === 0) return null;
    const active = items.some((i) => location.pathname === i.path);
    const open = openGroups[group.id] ?? active;
    return (
      <React.Fragment key={`group-${group.id}`}>
        <ListItemButton
          onClick={() => setOpenGroups((g) => ({ ...g, [group.id]: !open }))}
          sx={{ borderRadius: 1, mx: 0.5, my: 0.25 }}
        >
          <ListItemIcon sx={{ minWidth: 36, color: "primary.main" }}>{GROUP_ICONS[group.icon] ?? GROUP_ICONS.folder}</ListItemIcon>
          <ListItemText primary={group.label} slotProps={{ primary: { sx: { fontSize: 13, fontWeight: active ? 600 : 400 } } }} />
          {open ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
        </ListItemButton>
        <Collapse in={open} timeout="auto" unmountOnExit>
          <List dense disablePadding>
            {items.map((item) => renderItem(item, 4))}
          </List>
        </Collapse>
      </React.Fragment>
    );
  };

  const renderNavEntry = (entry: NavEntry): React.ReactNode => {
    if (entry.type === "block") return renderBlock(entry.key);
    if (entry.type === "group") return renderGroup(entry);
    return filterAdmin([catalogItem(entry.path)]).map((item) => renderItem(item));
  };

  return (
    <Box sx={{ display: "flex" }}>
      <TopBar />
      <Drawer
        variant="persistent"
        open={sidebarOpen}
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          "& .MuiDrawer-paper": { width: DRAWER_WIDTH, boxSizing: "border-box" },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: "auto" }}>
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600 }}>
              NAVIGATION
            </Typography>
          </Box>
          <Divider />
          <List dense>
            {navEntries.map((entry) => renderNavEntry(entry))}
          </List>
        </Box>
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 0,
          transition: "margin 0.2s",
          marginLeft: sidebarOpen ? 0 : `-${DRAWER_WIDTH}px`,
          minHeight: "100vh",
          bgcolor: "background.default",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Toolbar />
        <BannerStack />
        {currentReportKey && <ReportTagBar reportKey={currentReportKey} />}
        <Box sx={{ flexGrow: 1 }}>{children}</Box>
      </Box>

      <NodeDetailPanel />
      {moduleOn("surveys") && <SurveyNagDialog />}
      {moduleOn("surveys") && <RandomSurveyDialog />}
      {domainOverviewMounted && (
        <DomainOverviewDialog
          open={domainOverviewOpen}
          onClose={() => setDomainOverviewOpen(false)}
        />
      )}
    </Box>
  );
};

export default AppShell;
