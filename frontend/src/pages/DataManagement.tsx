import React, { useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Collapse,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControlLabel,
  FormGroup,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import BackupIcon from "@mui/icons-material/Backup";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import DeleteIcon from "@mui/icons-material/Delete";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import DownloadIcon from "@mui/icons-material/Download";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import RestoreIcon from "@mui/icons-material/Restore";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import WarningIcon from "@mui/icons-material/Warning";
import { useTranslation } from "react-i18next";
import { useSnackbar } from "notistack";
import { useBulkDeleteNodes } from "@/api/nodes";
import {
  useExportDatabase,
  useRestoreDatabase,
  useSnapshots,
  useCreateSnapshot,
  useRestoreSnapshot,
  useDeleteSnapshot,
} from "@/api/backup";
import { useGraphSnapshots, useCreateGraphSnapshot } from "@/api/graphSnapshots";

// ── Entity definitions ────────────────────────────────────────────────────────

interface DemoEntity {
  labelKey: string;
  node_type: string;
  external_source: string;
}

interface AllEntity {
  labelKey: string;
  node_type: string;
}

const DEMO_ENTITIES: DemoEntity[] = [
  { labelKey: "csvImport.entities.processes",    node_type: "Process",    external_source: "2C8" },
  { labelKey: "csvImport.entities.applications", node_type: "Application", external_source: "SHAREPOINT" },
];

const ALL_ENTITIES: AllEntity[] = [
  { labelKey: "csvImport.entities.processes",          node_type: "Process" },
  { labelKey: "csvImport.entities.applications",       node_type: "Application" },
  { labelKey: "csvImport.entities.informationObjects", node_type: "InformationObject" },
  { labelKey: "csvImport.entities.informationSources", node_type: "InformationSource" },
  { labelKey: "csvImport.entities.techComponents",     node_type: "TechnologyComponent" },
];

// ── Component ─────────────────────────────────────────────────────────────────

const DataManagement: React.FC = () => {
  const { t } = useTranslation();
  const { enqueueSnackbar } = useSnackbar();
  const bulkDelete = useBulkDeleteNodes();

  const [demoSelected, setDemoSelected] = useState<Set<string>>(new Set());
  const [allSelected, setAllSelected]   = useState<Set<string>>(new Set());

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeletes, setPendingDeletes] = useState<Array<{ node_type: string; external_source?: string }>>([]);
  const [confirmBodyKey, setConfirmBodyKey] = useState("");

  // Backup & snapshot state
  const exportDb = useExportDatabase();
  const restoreDb = useRestoreDatabase();
  const { data: snapshots = [], isLoading: loadingSnapshots } = useSnapshots();
  const createSnapshot = useCreateSnapshot();
  const restoreSnapshot = useRestoreSnapshot();
  const deleteSnapshot = useDeleteSnapshot();

  const [snapshotLabel, setSnapshotLabel] = useState("");
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<{ type: "file" | "snapshot"; filename?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Graph snapshot state
  const { data: graphSnapshots = [], isLoading: loadingGraphSnapshots } = useGraphSnapshots();
  const createGraphSnapshot = useCreateGraphSnapshot();
  const [graphSnapshotLabel, setGraphSnapshotLabel] = useState("");
  const [expandedGraphSnapshot, setExpandedGraphSnapshot] = useState<string | null>(null);

  const toggleDemo = (node_type: string) =>
    setDemoSelected((prev) => {
      const next = new Set(prev);
      if (next.has(node_type)) next.delete(node_type);
      else next.add(node_type);
      return next;
    });

  const toggleAll = (node_type: string) =>
    setAllSelected((prev) => {
      const next = new Set(prev);
      if (next.has(node_type)) next.delete(node_type);
      else next.add(node_type);
      return next;
    });

  const openConfirm = (
    deletes: Array<{ node_type: string; external_source?: string }>,
    bodyKey: string,
  ) => {
    setPendingDeletes(deletes);
    setConfirmBodyKey(bodyKey);
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    setConfirmOpen(false);
    let totalDeleted = 0;
    for (const filters of pendingDeletes) {
      try {
        const result = await bulkDelete.mutateAsync(filters);
        totalDeleted += result.deleted;
      } catch {
        enqueueSnackbar(t("dataManagement.deleteError"), { variant: "error" });
        return;
      }
    }
    enqueueSnackbar(t("dataManagement.deleted", { count: totalDeleted }), { variant: "success" });
    setDemoSelected(new Set());
    setAllSelected(new Set());
    setPendingDeletes([]);
  };

  const handleDeleteDemo = () => {
    const deletes = DEMO_ENTITIES
      .filter((e) => demoSelected.has(e.node_type))
      .map((e) => ({ node_type: e.node_type, external_source: e.external_source }));
    openConfirm(deletes, "dataManagement.confirmDemoBody");
  };

  const handleDeleteAll = () => {
    const deletes = ALL_ENTITIES
      .filter((e) => allSelected.has(e.node_type))
      .map((e) => ({ node_type: e.node_type }));
    openConfirm(deletes, "dataManagement.confirmAllBody");
  };

  // ── Backup handlers ────────────────────────────────────────────────────────

  const handleExport = async () => {
    try {
      const blob = await exportDb.mutateAsync();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ea_backup_${new Date().toISOString().slice(0, 19).replace(/[:.]/g, "")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      enqueueSnackbar(t("dataManagement.admin.exportSuccess"), { variant: "success" });
    } catch {
      enqueueSnackbar(t("dataManagement.admin.exportError"), { variant: "error" });
    }
  };

  const handleRestoreFile = () => {
    fileInputRef.current?.click();
  };

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreTarget({ type: "file" });
    setRestoreConfirmOpen(true);
  };

  const handleRestoreConfirm = async () => {
    setRestoreConfirmOpen(false);
    try {
      if (restoreTarget?.type === "file") {
        const file = fileInputRef.current?.files?.[0];
        if (!file) return;
        const result = await restoreDb.mutateAsync(file);
        enqueueSnackbar(t("dataManagement.admin.restoreSuccess", { nodes: result.nodes_restored, edges: result.edges_restored }), { variant: "success" });
      } else if (restoreTarget?.type === "snapshot" && restoreTarget.filename) {
        const result = await restoreSnapshot.mutateAsync(restoreTarget.filename);
        enqueueSnackbar(t("dataManagement.admin.restoreSuccess", { nodes: result.nodes_restored, edges: result.edges_restored }), { variant: "success" });
      }
    } catch {
      enqueueSnackbar(t("dataManagement.admin.restoreError"), { variant: "error" });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    setRestoreTarget(null);
  };

  const handleCreateSnapshot = async () => {
    if (!snapshotLabel.trim()) return;
    try {
      await createSnapshot.mutateAsync(snapshotLabel.trim());
      enqueueSnackbar(t("dataManagement.admin.snapshotCreated"), { variant: "success" });
      setSnapshotLabel("");
    } catch {
      enqueueSnackbar(t("dataManagement.admin.snapshotError"), { variant: "error" });
    }
  };

  const handleCreateGraphSnapshot = async () => {
    try {
      await createGraphSnapshot.mutateAsync(graphSnapshotLabel.trim() || null);
      enqueueSnackbar(t("dataManagement.graphSnapshots.created"), { variant: "success" });
      setGraphSnapshotLabel("");
    } catch {
      enqueueSnackbar(t("dataManagement.graphSnapshots.error"), { variant: "error" });
    }
  };

  const handleRestoreSnapshot = (filename: string) => {
    setRestoreTarget({ type: "snapshot", filename });
    setRestoreConfirmOpen(true);
  };

  const handleDeleteSnapshot = async (filename: string) => {
    try {
      await deleteSnapshot.mutateAsync(filename);
      enqueueSnackbar(t("dataManagement.admin.snapshotDeleted"), { variant: "success" });
    } catch {
      enqueueSnackbar(t("dataManagement.admin.snapshotError"), { variant: "error" });
    }
  };

  const isDeleting = bulkDelete.isPending;
  const isBusy = exportDb.isPending || restoreDb.isPending || createSnapshot.isPending || restoreSnapshot.isPending;

  return (
    <Box sx={{ p: 3, maxWidth: 720, mx: "auto" }}>
      <Typography variant="h5" mb={0.5}>{t("dataManagement.title")}</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        {t("dataManagement.subtitle")}
      </Typography>

      {/* ── Administrative Functions ── */}
      <Section icon={<AdminPanelSettingsIcon />} title={t("dataManagement.admin.title")} headerColor="info.main">
        <Typography variant="body2" color="text.secondary" mb={2}>
          {t("dataManagement.admin.description")}
        </Typography>

        {/* Export */}
        <Stack direction="row" spacing={1.5} alignItems="center" mb={2}>
          <Button
            variant="outlined"
            size="small"
            startIcon={exportDb.isPending ? <CircularProgress size={16} /> : <DownloadIcon />}
            disabled={isBusy}
            onClick={handleExport}
          >
            {t("dataManagement.admin.exportButton")}
          </Button>
          <Typography variant="caption" color="text.secondary">
            {t("dataManagement.admin.exportHint")}
          </Typography>
        </Stack>

        <Divider sx={{ my: 2 }} />

        {/* Restore */}
        <Stack direction="row" spacing={1.5} alignItems="center" mb={2}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            hidden
            onChange={onFileSelected}
          />
          <Button
            variant="outlined"
            size="small"
            color="warning"
            startIcon={restoreDb.isPending ? <CircularProgress size={16} /> : <UploadFileIcon />}
            disabled={isBusy}
            onClick={handleRestoreFile}
          >
            {t("dataManagement.admin.restoreButton")}
          </Button>
          <Typography variant="caption" color="text.secondary">
            {t("dataManagement.admin.restoreHint")}
          </Typography>
        </Stack>

        <Divider sx={{ my: 2 }} />

        {/* Create Snapshot */}
        <Typography variant="subtitle2" fontWeight={600} mb={1}>
          <PhotoCameraIcon fontSize="small" sx={{ verticalAlign: "middle", mr: 0.5 }} />
          {t("dataManagement.admin.snapshotTitle")}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
          {t("dataManagement.admin.snapshotDescription")}
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center" mb={2}>
          <TextField
            size="small"
            placeholder={t("dataManagement.admin.snapshotLabelPlaceholder")}
            value={snapshotLabel}
            onChange={(e) => setSnapshotLabel(e.target.value)}
            sx={{ flexGrow: 1, maxWidth: 350 }}
          />
          <Button
            variant="contained"
            size="small"
            startIcon={createSnapshot.isPending ? <CircularProgress size={16} /> : <BackupIcon />}
            disabled={!snapshotLabel.trim() || isBusy}
            onClick={handleCreateSnapshot}
          >
            {t("dataManagement.admin.createSnapshot")}
          </Button>
        </Stack>

        {/* Snapshot List */}
        {loadingSnapshots ? (
          <Box display="flex" justifyContent="center" py={2}><CircularProgress size={24} /></Box>
        ) : snapshots.length > 0 ? (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t("dataManagement.admin.snapshotLabel")}</TableCell>
                  <TableCell>{t("dataManagement.admin.snapshotDate")}</TableCell>
                  <TableCell align="center">{t("dataManagement.admin.snapshotNodes")}</TableCell>
                  <TableCell align="center">{t("dataManagement.admin.snapshotEdges")}</TableCell>
                  <TableCell align="right">{t("dataManagement.admin.snapshotActions")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {snapshots.map((s) => (
                  <TableRow key={s.filename} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>{s.label}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">
                        {new Date(s.created_at).toLocaleString()}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={s.node_count} size="small" />
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={s.edge_count} size="small" />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title={t("dataManagement.admin.restoreSnapshot")}>
                        <IconButton
                          size="small"
                          color="warning"
                          disabled={isBusy}
                          onClick={() => handleRestoreSnapshot(s.filename)}
                        >
                          <RestoreIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t("common.delete")}>
                        <IconButton
                          size="small"
                          color="error"
                          disabled={isBusy}
                          onClick={() => handleDeleteSnapshot(s.filename)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Typography variant="caption" color="text.secondary">
            {t("dataManagement.admin.noSnapshots")}
          </Typography>
        )}
      </Section>

      {/* ── Graph Versions ── */}
      <Section icon={<AccountTreeIcon />} title={t("dataManagement.graphSnapshots.title")} headerColor="success.main">
        <Typography variant="body2" color="text.secondary" mb={2}>
          {t("dataManagement.graphSnapshots.description")}
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center" mb={2}>
          <TextField
            size="small"
            placeholder={t("dataManagement.graphSnapshots.labelPlaceholder")}
            value={graphSnapshotLabel}
            onChange={(e) => setGraphSnapshotLabel(e.target.value)}
            sx={{ flexGrow: 1, maxWidth: 350 }}
          />
          <Button
            variant="contained"
            size="small"
            color="success"
            startIcon={createGraphSnapshot.isPending ? <CircularProgress size={16} color="inherit" /> : <CameraAltIcon />}
            disabled={createGraphSnapshot.isPending}
            onClick={handleCreateGraphSnapshot}
          >
            {t("dataManagement.graphSnapshots.createButton")}
          </Button>
        </Stack>

        {loadingGraphSnapshots ? (
          <Box display="flex" justifyContent="center" py={2}><CircularProgress size={24} /></Box>
        ) : graphSnapshots.length === 0 ? (
          <Typography variant="caption" color="text.secondary">
            {t("dataManagement.graphSnapshots.noSnapshots")}
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 36 }} />
                  <TableCell sx={{ width: 40 }}>{t("dataManagement.graphSnapshots.columnNumber")}</TableCell>
                  <TableCell>{t("dataManagement.graphSnapshots.columnDate")}</TableCell>
                  <TableCell>{t("dataManagement.graphSnapshots.columnBy")}</TableCell>
                  <TableCell>{t("dataManagement.graphSnapshots.columnLabel")}</TableCell>
                  <TableCell align="center">{t("dataManagement.graphSnapshots.columnNodes")}</TableCell>
                  <TableCell align="center">{t("dataManagement.graphSnapshots.columnEdges")}</TableCell>
                  <TableCell>{t("dataManagement.graphSnapshots.columnSource")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {graphSnapshots.map((gs) => {
                  const isExpanded = expandedGraphSnapshot === gs.id;
                  return (
                    <React.Fragment key={gs.id}>
                      <TableRow hover sx={{ cursor: "pointer" }} onClick={() => setExpandedGraphSnapshot(isExpanded ? null : gs.id)}>
                        <TableCell>
                          <ExpandMoreIcon
                            sx={{
                              fontSize: 18,
                              color: "text.disabled",
                              transition: "transform 0.2s",
                              transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600} color="text.secondary">
                            #{gs.snapshot_number}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption">
                            {new Date(gs.created_at).toLocaleString()}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">
                            {gs.created_by ?? "—"}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{gs.label ?? "—"}</Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Chip label={gs.node_count} size="small" color="primary" variant="outlined" />
                        </TableCell>
                        <TableCell align="center">
                          <Chip label={gs.edge_count} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">
                            {gs.triggered_by === "manual"
                              ? t("dataManagement.graphSnapshots.triggerManual")
                              : t("dataManagement.graphSnapshots.triggerExport")}
                          </Typography>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={8} sx={{ py: 0, border: isExpanded ? undefined : "none" }}>
                          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                            <Box sx={{ py: 1.5, px: 2, bgcolor: "action.hover", borderRadius: 1, my: 0.5 }}>
                              <Typography variant="caption" fontWeight={600} display="block" mb={1}>
                                {t("dataManagement.graphSnapshots.changesTitle")}
                              </Typography>
                              {gs.audit_entries.length === 0 ? (
                                <Typography variant="caption" color="text.secondary">
                                  {t("dataManagement.graphSnapshots.noChanges")}
                                </Typography>
                              ) : (
                                <Stack spacing={0.25}>
                                  {gs.audit_entries.map((entry) => (
                                    <Typography key={entry.id} variant="caption" color="text.secondary" component="div">
                                      <Box component="span" sx={{ fontWeight: 600, color: entry.action === "CREATE" ? "success.main" : entry.action === "DELETE" ? "error.main" : "warning.main", mr: 0.5 }}>
                                        {entry.action}
                                      </Box>
                                      {entry.entity_subtype ?? entry.entity_type}
                                      {entry.entity_name ? ` — ${entry.entity_name}` : ""}
                                      {entry.user_name ? <Box component="span" sx={{ color: "text.disabled", ml: 0.5 }}>({entry.user_name})</Box> : null}
                                    </Typography>
                                  ))}
                                </Stack>
                              )}
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Section>

      {/* ── Delete demo data ── */}
      <Section icon={<DeleteSweepIcon />} title={t("dataManagement.demoSection.title")}>
        <Typography variant="body2" color="text.secondary" mb={2}>
          {t("dataManagement.demoSection.description")}
        </Typography>
        <FormGroup>
          {DEMO_ENTITIES.map((e) => (
            <FormControlLabel
              key={e.node_type}
              control={
                <Checkbox
                  checked={demoSelected.has(e.node_type)}
                  onChange={() => toggleDemo(e.node_type)}
                  size="small"
                />
              }
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2">{t(e.labelKey)}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    ({e.external_source})
                  </Typography>
                </Stack>
              }
            />
          ))}
        </FormGroup>
        <Button
          variant="outlined"
          color="warning"
          size="small"
          sx={{ mt: 2 }}
          disabled={demoSelected.size === 0 || isDeleting}
          startIcon={isDeleting ? <CircularProgress size={16} color="inherit" /> : undefined}
          onClick={handleDeleteDemo}
        >
          {t("dataManagement.deleteSelected")}
        </Button>
      </Section>

      {/* ── Delete all records ── */}
      <Section
        icon={<WarningIcon color="error" />}
        title={t("dataManagement.allSection.title")}
        headerColor="error.main"
      >
        <Alert severity="warning" sx={{ mb: 2 }}>
          {t("dataManagement.allSection.warning")}
        </Alert>
        <FormGroup>
          {ALL_ENTITIES.map((e) => (
            <FormControlLabel
              key={e.node_type}
              control={
                <Checkbox
                  checked={allSelected.has(e.node_type)}
                  onChange={() => toggleAll(e.node_type)}
                  size="small"
                  color="error"
                />
              }
              label={<Typography variant="body2">{t(e.labelKey)}</Typography>}
            />
          ))}
        </FormGroup>
        <Button
          variant="outlined"
          color="error"
          size="small"
          sx={{ mt: 2 }}
          disabled={allSelected.size === 0 || isDeleting}
          startIcon={isDeleting ? <CircularProgress size={16} color="inherit" /> : undefined}
          onClick={handleDeleteAll}
        >
          {t("dataManagement.deleteSelected")}
        </Button>
      </Section>

      {/* ── Confirm delete dialog ── */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>{t("dataManagement.confirmTitle")}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t(confirmBodyKey)}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleConfirm} color="error" variant="contained" autoFocus>
            {t("common.delete")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Confirm restore dialog ── */}
      <Dialog open={restoreConfirmOpen} onClose={() => setRestoreConfirmOpen(false)}>
        <DialogTitle>{t("dataManagement.admin.restoreConfirmTitle")}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t("dataManagement.admin.restoreConfirmBody")}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setRestoreConfirmOpen(false); setRestoreTarget(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleRestoreConfirm} color="warning" variant="contained" autoFocus>
            {t("dataManagement.admin.restoreConfirm")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

// ── Section card ──────────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  headerColor = "primary.main",
  children,
}: {
  icon: React.ReactNode;
  title: string;
  headerColor?: string;
  children: React.ReactNode;
}) {
  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
          <Box sx={{ color: headerColor, display: "flex" }}>{icon}</Box>
          <Typography variant="h6" fontSize={16} fontWeight={600}>{title}</Typography>
        </Stack>
        <Divider sx={{ mb: 2 }} />
        {children}
      </CardContent>
    </Card>
  );
}

export default DataManagement;
