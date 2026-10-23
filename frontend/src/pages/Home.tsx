import FreezeNotice from "@/components/calendar/FreezeNotice";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box, Button, Card, CardActionArea, CardContent,
  Dialog, DialogContent, DialogTitle, Grid, IconButton,
  List, ListItemButton, ListItemIcon, ListItemText,
  Stack, TextField, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import DeviceHubIcon from "@mui/icons-material/DeviceHub";
import EditIcon from "@mui/icons-material/Edit";
import RouteIcon from "@mui/icons-material/Route";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useNodes } from "@/api/nodes";
import { useEdges } from "@/api/edges";
import { useShortcuts, useUpdateShortcuts } from "@/api/shortcuts";
import { useModules } from "@/api/orgSettings";
import { useVisibleJourney } from "@/api/architectureJourney";
import { NODE_COLORS } from "@/config/graphConfig";
import {
  SHORTCUT_DRAG_MIME,
  SHORTCUT_REGISTRY,
  getShortcut,
  type ShortcutMeta,
} from "@/config/shortcutRegistry";
import type { NodeType } from "@/types/graph";
import { useRoleStore } from "@/store/roleStore";
import { isCountedProcess, isStructural, structuralProcessIds } from "@/utils/processStructure";

const STAT_TYPES: Array<{ type: NodeType; labelKey: string; defKey: string; path: string }> = [
  { type: "Process", labelKey: "home.stats.processes", defKey: "home.definitions.process", path: "/processes" },
  { type: "Application", labelKey: "home.stats.applications", defKey: "home.definitions.application", path: "/systems" },
  { type: "InformationObject", labelKey: "home.stats.infoObjects", defKey: "home.definitions.informationObject", path: "/info-objects" },
  { type: "InformationSource", labelKey: "home.stats.infoSources", defKey: "home.definitions.informationSource", path: "/info-sources" },
  { type: "TechnologyComponent", labelKey: "home.stats.techComponents", defKey: "home.definitions.technologyComponent", path: "/tech-components" },
  { type: "Server", labelKey: "home.stats.servers", defKey: "home.definitions.server", path: "/servers" },
  { type: "ServerService", labelKey: "home.stats.serverServices", defKey: "home.definitions.serverService", path: "/server-services" },
];

const SERVER_TYPES: NodeType[] = ["Server", "ServerService"];

const Home: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { enabled: moduleOn } = useModules();

  const { data: allNodes, isLoading: statsLoading } = useNodes();
  // Grouping pages in the process hierarchy are not objects in their own
  // right, so they do not belong in the counts either — nor do hidden nodes
  // or processes whose current version in 2C8 is not approved.
  const structuralIds = React.useMemo(() => structuralProcessIds(allNodes ?? []), [allNodes]);
  const { data: allEdges, isLoading: edgesLoading } = useEdges();
  const serverAccess = useRoleStore((s) => s.serverAccess);

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>{t("home.welcome")}</Typography>
          <Typography variant="body1" sx={{ color: "text.secondary" }}>{t("home.description")}</Typography>
        </Box>
      </Stack>

      {moduleOn("calendar") && <FreezeNotice />}

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {STAT_TYPES.filter((s) => !SERVER_TYPES.includes(s.type) || serverAccess !== "none").map(({ type, labelKey, defKey, path }) => {
          const count = statsLoading
            ? null
            : (allNodes ?? []).filter((n) =>
                type === "Process"
                  ? isCountedProcess(n, structuralIds)
                  : n.type === type && !n.admin_hidden && !isStructural(n, structuralIds),
              ).length;
          return (
            <Grid key={type} size={{ xs: 6, sm: 3, md: 3 }}>
              <Tooltip title={t(defKey)} arrow placement="bottom" enterDelay={300}>
                <Card>
                  <CardActionArea onClick={() => navigate(path)} sx={{ py: 2 }}>
                    <CardContent sx={{ textAlign: "center", py: 0 }}>
                      <Box sx={{ width: 16, height: 16, borderRadius: "50%", bgcolor: NODE_COLORS[type], mx: "auto", mb: 1 }} />
                      <Typography variant="h4" sx={{ fontWeight: 700 }}>
                        {count === null ? "…" : count}
                      </Typography>
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>{t(labelKey)}</Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Tooltip>
            </Grid>
          );
        })}
        <Grid size={{ xs: 6, sm: 3, md: 3 }}>
          <Tooltip title={t("home.definitions.connection")} arrow placement="bottom" enterDelay={300}>
            <Card>
              <CardActionArea onClick={() => navigate("/connections")} sx={{ py: 2 }}>
                <CardContent sx={{ textAlign: "center", py: 0 }}>
                  <DeviceHubIcon sx={{ fontSize: 16, color: "#607D8B", mx: "auto", mb: 1, display: "block" }} />
                  <Typography variant="h4" sx={{ fontWeight: 700 }}>
                    {edgesLoading ? "…" : (allEdges ?? []).length}
                  </Typography>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>{t("home.stats.connections")}</Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Tooltip>
        </Grid>
      </Grid>

      <ShortcutsSection />
      <JourneyTeaser />
    </Box>
  );
};

/** Arkitekturresan, when it has steps to show — editors always see it, so
 * they can reach the page and add steps of their own. */
const JourneyTeaser: React.FC = () => {
  const navigate = useNavigate();
  const journey = useVisibleJourney();
  const { isEditor } = useRoleStore();
  if (!journey || (journey.steps.length === 0 && !isEditor)) return null;
  return (
    <Box sx={{ mt: 3 }}>
      <Card
        variant="outlined"
        sx={{
          cursor: "pointer",
          "&:hover": { boxShadow: 2 },
          borderLeft: "4px solid",
          borderLeftColor: "primary.main",
        }}
        onClick={() => navigate("/arkitekturresan")}
      >
        <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, py: 2, "&:last-child": { pb: 2 } }}>
          <RouteIcon sx={{ fontSize: 36, color: "primary.main", flexShrink: 0 }} />
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {journey.title}
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              {journey.steps.map((s) => s.title).join(" · ") || "Inga steg ännu"}
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

const EDIT_TIMEOUT_MS = 60_000;

const ShortcutsSection: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: savedPaths = [] } = useShortcuts();
  const update = useUpdateShortcuts();
  const { pathEnabled } = useModules();
  // Shortcuts to a switched-off module stay saved but are not shown, so they
  // come back with the module; edits keep them at the end.
  const paths = savedPaths.filter((p) => pathEnabled(p));
  const hidden = savedPaths.filter((p) => !pathEnabled(p));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropOver, setDropOver] = useState(false);
  const [editing, setEditing] = useState(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  const bump = useCallback(() => {
    clearTimer();
    timerRef.current = window.setTimeout(() => setEditing(false), EDIT_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    if (editing) bump();
    else clearTimer();
    return clearTimer;
  }, [editing, bump]);

  const items: ShortcutMeta[] = paths
    .map((p) => getShortcut(p))
    .filter((s): s is ShortcutMeta => s !== undefined);

  const remove = (path: string) => { bump(); update.mutate([...paths.filter((p) => p !== path), ...hidden]); };
  const add = (path: string) => {
    bump();
    if (!paths.includes(path)) update.mutate([...paths, path, ...hidden]);
  };
  const reorder = (from: number, to: number) => {
    if (from === to) return;
    bump();
    const next = [...paths];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    update.mutate([...next, ...hidden]);
  };

  const onZoneDragOver = (e: React.DragEvent) => {
    if (!editing) return;
    if (e.dataTransfer.types.includes(SHORTCUT_DRAG_MIME) || dragIndex !== null) {
      e.preventDefault();
      bump();
      setDropOver(true);
    }
  };
  const onZoneDragLeave = () => setDropOver(false);
  const onZoneDrop = (e: React.DragEvent) => {
    if (!editing) return;
    e.preventDefault();
    setDropOver(false);
    const path = e.dataTransfer.getData(SHORTCUT_DRAG_MIME);
    if (path && getShortcut(path) && pathEnabled(path)) add(path);
  };

  const onCardDragStart = (idx: number) => (e: React.DragEvent) => {
    if (!editing) { e.preventDefault(); return; }
    setDragIndex(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", paths[idx]);
  };
  const onCardDragEnd = () => setDragIndex(null);
  const onCardDragOver = (idx: number) => (e: React.DragEvent) => {
    if (dragIndex === null) return;
    e.preventDefault();
    if (idx !== dragIndex) reorderPreview(idx);
  };
  const reorderPreview = (overIdx: number) => {
    if (dragIndex === null || dragIndex === overIdx) return;
    reorder(dragIndex, overIdx);
    setDragIndex(overIdx);
  };

  return (
    <>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
        <Typography variant="h6">{t("home.quickLinks")}</Typography>
        <Tooltip title={t(editing ? "home.shortcuts.editDone" : "home.shortcuts.editStart", {
          defaultValue: editing ? "Klar" : "Anpassa genvägar",
        })}>
          <IconButton
            size="small"
            color={editing ? "primary" : "default"}
            onClick={() => setEditing((e) => !e)}
          >
            {editing ? <CheckIcon fontSize="small" /> : <EditIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        {editing && (
          <Button
            startIcon={<AddIcon />}
            size="small"
            variant="outlined"
            onClick={() => { bump(); setPickerOpen(true); }}
          >
            {t("home.shortcuts.add", { defaultValue: "Lägg till" })}
          </Button>
        )}
      </Stack>

      <Box
        onDragOver={onZoneDragOver}
        onDragLeave={onZoneDragLeave}
        onDrop={onZoneDrop}
        sx={{
          minHeight: 100,
          borderRadius: 1,
          p: 1,
          border: editing ? "2px dashed" : "2px solid transparent",
          borderColor: dropOver ? "primary.main" : editing ? "divider" : "transparent",
          bgcolor: dropOver ? "action.hover" : "transparent",
          transition: "border-color 0.15s, background-color 0.15s",
        }}
      >
        {items.length === 0 ? (
          <Box sx={{ py: 4, textAlign: "center", color: "text.secondary" }}>
            <Typography variant="body2">
              {editing
                ? t("home.shortcuts.empty", {
                    defaultValue: "Inga genvägar än. Klicka på Lägg till, eller dra hit en sida från menyn.",
                  })
                : t("home.shortcuts.emptyReadOnly", {
                    defaultValue: "Inga genvägar än. Klicka på pennan för att anpassa.",
                  })}
            </Typography>
          </Box>
        ) : (
          <Grid container spacing={2}>
            {items.map((item, idx) => (
              <Grid key={item.path} size={{ xs: 12, sm: 6, md: 3 }}>
                <Card
                  draggable={editing}
                  onDragStart={onCardDragStart(idx)}
                  onDragEnd={onCardDragEnd}
                  onDragOver={onCardDragOver(idx)}
                  sx={{
                    position: "relative",
                    opacity: dragIndex === idx ? 0.4 : 1,
                    cursor: editing ? "grab" : "pointer",
                    "&:active": editing ? { cursor: "grabbing" } : {},
                  }}
                >
                  {editing && (
                    <Tooltip title={t("home.shortcuts.remove", { defaultValue: "Ta bort genväg" })}>
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); remove(item.path); }}
                        sx={{
                          position: "absolute",
                          top: 4,
                          right: 4,
                          zIndex: 2,
                          bgcolor: "background.paper",
                          "&:hover": { bgcolor: "error.light", color: "error.contrastText" },
                        }}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  <CardActionArea onClick={() => navigate(item.path)} sx={{ p: 2 }}>
                    <Stack spacing={1} sx={{ alignItems: "center", py: 2 }}>
                      <Box sx={{ color: "primary.main", "& svg": { fontSize: 48 } }}>{item.icon}</Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, textAlign: "center" }}>
                        {t(item.labelKey)}
                      </Typography>
                    </Stack>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Box>

      {editing && (
        <Typography variant="caption" sx={{ color: "text.secondary", mt: 1, display: "block" }}>
          {t("home.shortcuts.hint", {
            defaultValue:
              "Dra menyalternativ från sidomenyn hit för att lägga till. Dra korten för att sortera. Anpassningsläget stängs av efter 60 sekunder utan aktivitet.",
          })}
        </Typography>
      )}

      <PickerDialog
        open={pickerOpen}
        onClose={() => { bump(); setPickerOpen(false); }}
        existing={paths}
        onPick={(p) => { add(p); setPickerOpen(false); }}
      />
    </>
  );
};

interface PickerProps {
  open: boolean;
  onClose: () => void;
  existing: string[];
  onPick: (path: string) => void;
}

const PickerDialog: React.FC<PickerProps> = ({ open, onClose, existing, onPick }) => {
  const { t } = useTranslation();
  const { pathEnabled } = useModules();
  const [q, setQ] = useState("");
  const lowerQ = q.trim().toLowerCase();

  const candidates = useMemo(() => {
    return SHORTCUT_REGISTRY
      .filter((s) => !existing.includes(s.path) && pathEnabled(s.path))
      .map((s) => ({ ...s, label: t(s.labelKey) }))
      .filter((s) => !lowerQ || s.label.toLowerCase().includes(lowerQ))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [existing, lowerQ, t, pathEnabled]);

  return (
    <Dialog open={open} onClose={() => { setQ(""); onClose(); }} fullWidth maxWidth="sm">
      <DialogTitle>{t("home.shortcuts.pickerTitle", { defaultValue: "Lägg till genväg" })}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          size="small"
          placeholder={t("common.search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          sx={{ mb: 2 }}
        />
        <List dense sx={{ maxHeight: 400, overflowY: "auto" }}>
          {candidates.length === 0 ? (
            <Typography variant="body2" sx={{ color: "text.secondary", p: 2, textAlign: "center" }}>
              {t("home.shortcuts.noCandidates", { defaultValue: "Inga fler sidor att lägga till." })}
            </Typography>
          ) : (
            candidates.map((c) => (
              <ListItemButton key={c.path} onClick={() => onPick(c.path)}>
                <ListItemIcon>{c.icon}</ListItemIcon>
                <ListItemText primary={c.label} secondary={c.path} />
              </ListItemButton>
            ))
          )}
        </List>
      </DialogContent>
    </Dialog>
  );
};

export default Home;
