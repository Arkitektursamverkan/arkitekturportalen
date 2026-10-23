import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import RestoreIcon from "@mui/icons-material/Restore";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { useTranslation } from "react-i18next";
import { useSnackbar } from "notistack";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import { useAuditLog, useRestoreEntity, useClearAuditLog, type AuditLogEntry } from "@/api/audit";

const ACTION_COLORS: Record<string, "success" | "info" | "error"> = {
  CREATE: "success",
  UPDATE: "info",
  DELETE: "error",
  PROPOSE: "info",
  PROPOSE_DONE: "success",
};

const PAGE_SIZE = 25;

const AuditLogPanel: React.FC = () => {
  const { t } = useTranslation();
  const { enqueueSnackbar } = useSnackbar();

  const [entityType, setEntityType] = useState<string>("");
  const [action, setAction] = useState<string>("");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<AuditLogEntry | null>(null);
  const [restoreEdges, setRestoreEdges] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);

  const restore = useRestoreEntity();
  const clearLog = useClearAuditLog();

  const { data, isLoading } = useAuditLog({
    entity_type: entityType || undefined,
    action: action || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleRestore = () => {
    if (!restoreTarget) return;
    restore.mutate({ id: restoreTarget.id, restoreEdges: restoreTarget.entity_type === "node" ? restoreEdges : false }, {
      onSuccess: () => {
        enqueueSnackbar(
          t("auditLog.restoreConfirm.success", { name: restoreTarget.entity_name ?? restoreTarget.entity_id }),
          { variant: "success" },
        );
        setRestoreTarget(null);
      },
      onError: () => {
        enqueueSnackbar(t("auditLog.restoreConfirm.error"), { variant: "error" });
        setRestoreTarget(null);
      },
    });
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "medium" });
  };

  return (
    <Box>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
        {t("auditLog.description")}
      </Typography>

      {/* Filters */}
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>{t("auditLog.filters.entityType")}</InputLabel>
          <Select
            label={t("auditLog.filters.entityType")}
            value={entityType}
            onChange={(e) => { setEntityType(e.target.value); setPage(0); }}
          >
            <MenuItem value="">{t("auditLog.filters.all")}</MenuItem>
            <MenuItem value="node">{t("auditLog.entityTypes.node")}</MenuItem>
            <MenuItem value="edge">{t("auditLog.entityTypes.edge")}</MenuItem>
            <MenuItem value="document">{t("auditLog.entityTypes.document")}</MenuItem>
            <MenuItem value="access">{t("auditLog.entityTypes.access")}</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>{t("auditLog.filters.action")}</InputLabel>
          <Select
            label={t("auditLog.filters.action")}
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(0); }}
          >
            <MenuItem value="">{t("auditLog.filters.all")}</MenuItem>
            <MenuItem value="CREATE">{t("auditLog.actions.CREATE")}</MenuItem>
            <MenuItem value="UPDATE">{t("auditLog.actions.UPDATE")}</MenuItem>
            <MenuItem value="DELETE">{t("auditLog.actions.DELETE")}</MenuItem>
            <MenuItem value="PROPOSE">{t("auditLog.actions.PROPOSE")}</MenuItem>
            <MenuItem value="PROPOSE_DONE">{t("auditLog.actions.PROPOSE_DONE")}</MenuItem>
            <MenuItem value="PROPOSE_REJECT">{t("auditLog.actions.PROPOSE_REJECT")}</MenuItem>
            <MenuItem value="PROPOSE_WITHDRAW">{t("auditLog.actions.PROPOSE_WITHDRAW")}</MenuItem>
          </Select>
        </FormControl>
        <Box sx={{ flex: 1 }} />
        <Typography variant="body2" sx={{ color: "text.secondary", alignSelf: "center" }}>
          {total} {t("auditLog.entries")}
        </Typography>
        {total > 0 && (
          <Button
            size="small"
            color="error"
            variant="outlined"
            startIcon={<DeleteSweepIcon fontSize="small" />}
            onClick={() => setConfirmClear(true)}
            sx={{ fontSize: 11, textTransform: "none" }}
          >
            {t("auditLog.clear")}
          </Button>
        )}
      </Stack>

      {/* Table */}
      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : items.length === 0 ? (
        <Typography align="center" sx={{ color: "text.secondary", py: 4 }}>
          {t("auditLog.noEntries")}
        </Typography>
      ) : (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" sx={{ tableLayout: "fixed" }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 36 }} />
                  <TableCell sx={{ width: 145 }}>{t("auditLog.columns.timestamp")}</TableCell>
                  <TableCell sx={{ width: 100 }}>{t("auditLog.columns.action")}</TableCell>
                  <TableCell sx={{ width: 150 }}>{t("auditLog.columns.entityType")}</TableCell>
                  <TableCell>{t("auditLog.columns.entityName")}</TableCell>
                  <TableCell sx={{ width: 120 }} align="right">{t("auditLog.columns.actions")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((entry) => {
                  const isExpanded = expandedId === entry.id;
                  return (
                    <React.Fragment key={entry.id}>
                      <TableRow hover sx={{ cursor: "pointer" }} onClick={() => setExpandedId(isExpanded ? null : entry.id)}>
                        <TableCell sx={{ py: 0.5 }}>
                          <IconButton size="small">
                            {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                          </IconButton>
                        </TableCell>
                        <TableCell sx={{ fontSize: 12, whiteSpace: "nowrap" }}>
                          {formatDate(entry.created_at)}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={t(`auditLog.actions.${entry.action}`)}
                            color={ACTION_COLORS[entry.action] ?? "default"}
                            size="small"
                            sx={{ fontSize: 11 }}
                          />
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                            <Typography variant="body2" sx={{ fontSize: 12 }}>
                              {t(`auditLog.entityTypes.${entry.entity_type}`)}
                            </Typography>
                            {entry.entity_subtype && (
                              <Chip label={entry.entity_subtype} size="small" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <Typography variant="body2" noWrap title={entry.entity_name ?? entry.entity_id} sx={{ fontSize: 12, fontWeight: 500 }}>
                            {entry.entity_name ?? entry.entity_id}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          {/* Only objects and connections keep a snapshot to restore from. */}
                          {entry.action === "DELETE" && !entry.restored && (entry.entity_type === "node" || entry.entity_type === "edge") && (
                            <Button
                              size="small"
                              variant="outlined"
                              color="primary"
                              startIcon={<RestoreIcon fontSize="small" />}
                              onClick={(e) => { e.stopPropagation(); setRestoreEdges(true); setRestoreTarget(entry); }}
                              sx={{ fontSize: 11, textTransform: "none" }}
                            >
                              {t("auditLog.restore")}
                            </Button>
                          )}
                          {entry.action === "DELETE" && entry.restored && (
                            <Chip label={t("auditLog.restored")} size="small" color="success" variant="outlined" sx={{ fontSize: 10 }} />
                          )}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={6} sx={{ py: 0, border: isExpanded ? undefined : 0 }}>
                          <Collapse in={isExpanded}>
                            <Box sx={{ py: 1.5, px: 1 }}>
                              {(entry.user_name || entry.change_note) && (
                                <Typography variant="body2" sx={{ fontSize: 12, mb: 1, whiteSpace: "pre-wrap" }}>
                                  {entry.user_name && <><strong>{entry.user_name}</strong>{entry.change_note ? " – " : ""}</>}
                                  {entry.change_note}
                                </Typography>
                              )}
                              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                                {entry.snapshot_before && (
                                  <Box sx={{ flex: 1 }}>
                                    <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
                                      {t("auditLog.snapshot.before")}
                                    </Typography>
                                    <Paper variant="outlined" sx={{ p: 1, mt: 0.5, maxHeight: 200, overflow: "auto" }}>
                                      <pre style={{ margin: 0, fontSize: 11, whiteSpace: "pre-wrap" }}>
                                        {JSON.stringify(entry.snapshot_before, null, 2)}
                                      </pre>
                                    </Paper>
                                  </Box>
                                )}
                                {entry.snapshot_after && (
                                  <Box sx={{ flex: 1 }}>
                                    <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
                                      {t("auditLog.snapshot.after")}
                                    </Typography>
                                    <Paper variant="outlined" sx={{ p: 1, mt: 0.5, maxHeight: 200, overflow: "auto" }}>
                                      <pre style={{ margin: 0, fontSize: 11, whiteSpace: "pre-wrap" }}>
                                        {JSON.stringify(entry.snapshot_after, null, 2)}
                                      </pre>
                                    </Paper>
                                  </Box>
                                )}
                              </Stack>
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

          {/* Pagination */}
          {totalPages > 1 && (
            <Stack direction="row" spacing={1} sx={{ justifyContent: "center", mt: 2 }}>
              <Button size="small" disabled={page === 0} onClick={() => setPage(page - 1)}>
                &laquo;
              </Button>
              <Typography variant="body2" sx={{ alignSelf: "center" }}>
                {page + 1} / {totalPages}
              </Typography>
              <Button size="small" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                &raquo;
              </Button>
            </Stack>
          )}
        </>
      )}

      {/* Restore confirmation dialog */}
      <Dialog open={!!restoreTarget} onClose={() => setRestoreTarget(null)}>
        <DialogTitle>{t("auditLog.restoreConfirm.title")}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {restoreTarget && t("auditLog.restoreConfirm.body", {
              type: t(`auditLog.entityTypes.${restoreTarget.entity_type}`),
              name: restoreTarget.entity_name ?? restoreTarget.entity_id,
            })}
          </DialogContentText>
          {restoreTarget?.entity_type === "node" && (
            <FormControlLabel
              sx={{ mt: 1.5 }}
              control={
                <Checkbox checked={restoreEdges} onChange={(e) => setRestoreEdges(e.target.checked)} />
              }
              label={t("auditLog.restoreConfirm.restoreEdges")}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRestoreTarget(null)}>{t("common.cancel")}</Button>
          <Button variant="contained" onClick={handleRestore} disabled={restore.isPending}>
            {t("auditLog.restore")}
          </Button>
        </DialogActions>
      </Dialog>
      {/* Clear audit log confirmation */}
      <Dialog open={confirmClear} onClose={() => setConfirmClear(false)}>
        <DialogTitle>{t("auditLog.clearConfirm.title")}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t("auditLog.clearConfirm.body", { count: total })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClear(false)}>{t("common.cancel")}</Button>
          <Button
            color="error"
            variant="contained"
            disabled={clearLog.isPending}
            onClick={() => {
              clearLog.mutate(undefined, {
                onSuccess: () => {
                  setConfirmClear(false);
                  setPage(0);
                  enqueueSnackbar(t("auditLog.clearConfirm.success"), { variant: "success" });
                },
              });
            }}
          >
            {t("common.delete")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AuditLogPanel;
