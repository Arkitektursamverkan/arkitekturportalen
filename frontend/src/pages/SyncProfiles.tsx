import React, { useMemo, useState } from "react";
import {
  Alert, Box, Button, Card, CardContent, Chip,
  CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, Stack, Switch, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Tooltip, Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import SyncIcon from "@mui/icons-material/Sync";
import LinkIcon from "@mui/icons-material/Link";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useTranslation } from "react-i18next";
import { useSnackbar } from "notistack";
import { useNavigate } from "react-router-dom";
import {
  useSyncProfiles, useDeleteSyncProfile, useManualSync, useSaveSyncProfile,
  type SyncProfile,
} from "@/api/sync";
import { useSourceFields, useNodeTypes } from "@/api/platformImport";
import { useSyncArkflows } from "@/api/arkflows";
import { useModules } from "@/api/orgSettings";
import MappingTable, { type EaField, type FieldMap } from "@/components/sync/MappingTable";
import { NODE_COLORS } from "@/config/graphConfig";
import type { NodeType } from "@/types/graph";

const SyncProfiles: React.FC = () => {
  const { t } = useTranslation();
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const { data: profiles, isLoading } = useSyncProfiles();
  const deleteMutation = useDeleteSyncProfile();
  const syncMutation = useManualSync();
  const saveMutation = useSaveSyncProfile();
  const [editingProfile, setEditingProfile] = useState<SyncProfile | null>(null);
  const arkflowSync = useSyncArkflows();
  const { enabled: moduleOn } = useModules();

  const webhookUrl = `${window.location.protocol}//${window.location.hostname}:8000/api/v1/sync/webhook`;

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: "auto" }}>
      <Typography variant="h5" gutterBottom>{t("sync.title", { defaultValue: "Sync Profiles" })}</Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 3 }}>
        {t("sync.description", { defaultValue: "Configure automatic sync between the Integration Platform and EA Application. When a flow runs in the Integration Platform, it notifies the EA App via webhook and data is synced automatically." })}
      </Typography>

      {/* Webhook URL info */}
      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2" gutterBottom sx={{ fontWeight: 600 }}>
          {t("sync.webhookInfo", { defaultValue: "Webhook URL for Integration Platform" })}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Typography variant="body2" sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
            {webhookUrl}
          </Typography>
          <Tooltip title="Copy">
            <IconButton size="small" onClick={() => {
              navigator.clipboard.writeText(webhookUrl);
              enqueueSnackbar("URL copied", { variant: "info" });
            }}>
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
        <Typography variant="caption" sx={{ color: "text.secondary", mt: 1, display: "block" }}>
          {t("sync.webhookHint", { defaultValue: "Set this as the Post-Execution Webhook URL on each flow in the Integration Platform. The platform's POST_EXEC_WEBHOOK_SECRET must equal SYNC_WEBHOOK_SECRET here; without it the webhook is switched off." })}
        </Typography>
      </Alert>

      {/* ── Flödesscheman från Arkitekten ──────────────────────────────────
          Egen ruta, inte en rad i tabellen nedan: profilerna där kopierar in
          data som EA-noder, medan flödesschemana bara VISAS (portalen speglar
          dem, den äger dem inte). Samma knapp för båda hade lovat samma sak om
          två olika saker. Plattformens pipeline går varannan timme; den här
          knappen är för den som just ändrat något i Arkitekten och inte vill
          vänta. */}
      {moduleOn("arkitekten") && (
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {t("sync.arkflowTitle", { defaultValue: "Process diagrams from Arkitekten" })}
              </Typography>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                {t("sync.arkflowHint", {
                  defaultValue:
                    "Fetches the process diagrams again. Runs automatically every two hours — use this when you have just changed something in Arkitekten. Only approved versions are fetched; a draft stays invisible until it is approved.",
                })}
              </Typography>
            </Box>
            <Button
              variant="contained"
              startIcon={arkflowSync.isPending ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}
              disabled={arkflowSync.isPending}
              onClick={async () => {
                try {
                  const res = await arkflowSync.mutateAsync();
                  enqueueSnackbar(
                    t("sync.arkflowDone", {
                      defaultValue: "{{count}} process diagrams fetched, {{updated}} updated.",
                      count: res.records_processed,
                      updated: res.records_updated,
                    }),
                    { variant: res.failed.length ? "warning" : "success" },
                  );
                } catch (e: any) {
                  // Säg VAD som gick fel. Vanligaste fallet är att nyckeln till
                  // plattformen saknas (503) eller att Arkitektens flödestjänst
                  // är nere (502) – båda går att åtgärda, men inte i blindo.
                  enqueueSnackbar(
                    e?.response?.data?.detail ??
                      t("sync.arkflowFailed", { defaultValue: "The sync could not be run." }),
                    { variant: "error" },
                  );
                }
              }}
            >
              {arkflowSync.isPending
                ? t("sync.arkflowRunning", { defaultValue: "Fetching …" })
                : t("sync.arkflowRun", { defaultValue: "Fetch now" })}
            </Button>
          </Stack>
          {arkflowSync.data && (
            <Alert severity={arkflowSync.data.failed.length ? "warning" : "success"} sx={{ mt: 2 }}>
              {t("sync.arkflowResult", {
                defaultValue: "Last run: {{count}} process diagrams, {{updated}} updated.",
                count: arkflowSync.data.records_processed,
                updated: arkflowSync.data.records_updated,
              })}
            </Alert>
          )}
        </CardContent>
      </Card>
      )}

      {/* Create new profile link */}
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
        <Button
          variant="contained"
          startIcon={<LinkIcon />}
          onClick={() => navigate("/platform-import")}
        >
          {t("sync.createFromImport", { defaultValue: "Create profile via Import wizard" })}
        </Button>
      </Box>

      {/* Profiles table */}
      {isLoading ? (
        <Typography>Loading...</Typography>
      ) : !profiles?.length ? (
        <Card>
          <CardContent>
            <Typography sx={{ color: "text.secondary", textAlign: "center", py: 3 }}>
              {t("sync.noProfiles", { defaultValue: "No sync profiles configured yet. Use the Import wizard to create one, and save it as a sync profile." })}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <TableContainer component={Card}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t("sync.colEnabled", { defaultValue: "Active" })}</TableCell>
                <TableCell>{t("sync.colFlow", { defaultValue: "Flow" })}</TableCell>
                <TableCell>{t("sync.colNodeType", { defaultValue: "Node Type" })}</TableCell>
                <TableCell>{t("sync.colMappings", { defaultValue: "Mappings" })}</TableCell>
                <TableCell>{t("sync.colSource", { defaultValue: "Source Label" })}</TableCell>
                <TableCell align="right">{t("sync.colActions", { defaultValue: "Actions" })}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {profiles.map((p) => (
                <TableRow key={p.flow_id} hover>
                  <TableCell>
                    <Switch
                      size="small"
                      checked={p.enabled}
                      onChange={async () => {
                        try {
                          await saveMutation.mutateAsync({ ...p, enabled: !p.enabled });
                          enqueueSnackbar(p.enabled ? "Profile disabled" : "Profile enabled", { variant: "success" });
                        } catch {
                          enqueueSnackbar("Failed to update", { variant: "error" });
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {p.flow_name || p.flow_id.slice(0, 8)}
                    </Typography>
                    <Typography variant="caption" sx={{ fontFamily: "monospace", color: "text.secondary" }}>
                      {p.flow_id.slice(0, 8)}...
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Box sx={{
                        width: 10, height: 10, borderRadius: "50%",
                        bgcolor: NODE_COLORS[p.node_type.split(":")[0] as NodeType] ?? "#999",
                      }} />
                      <Typography variant="body2">{p.node_type}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Chip label={`${p.mappings.length} fields`} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Chip label={p.external_source_label} size="small" />
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title={t("sync.editMappings", { defaultValue: "Edit mappings" })}>
                      <IconButton size="small" onClick={() => setEditingProfile(p)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Sync now">
                      <IconButton
                        size="small"
                        color="primary"
                        disabled={syncMutation.isPending}
                        onClick={async () => {
                          try {
                            const result = await syncMutation.mutateAsync(p.flow_id);
                            enqueueSnackbar(
                              `Sync complete: ${result.created} created, ${result.updated} updated`,
                              { variant: "success" },
                            );
                          } catch (err: any) {
                            enqueueSnackbar(err.message || "Sync failed", { variant: "error" });
                          }
                        }}
                      >
                        <SyncIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete profile">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={async () => {
                          if (!window.confirm(`Ta bort sync-profilen för ${p.flow_name || p.flow_id.slice(0, 8)}?`)) return;
                          try {
                            await deleteMutation.mutateAsync(p.flow_id);
                            enqueueSnackbar("Profile deleted", { variant: "success" });
                          } catch {
                            enqueueSnackbar("Failed to delete", { variant: "error" });
                          }
                        }}
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
      )}

      {editingProfile && (
        <EditMappingsDialog
          profile={editingProfile}
          onClose={() => setEditingProfile(null)}
        />
      )}
    </Box>
  );
};

// ── Edit mappings dialog ─────────────────────────────────────────────────────

const EditMappingsDialog: React.FC<{
  profile: SyncProfile;
  onClose: () => void;
}> = ({ profile, onClose }) => {
  const { enqueueSnackbar } = useSnackbar();
  const save = useSaveSyncProfile();

  const { data: fieldsData, isLoading: fieldsLoading, error: fieldsError } = useSourceFields(
    profile.flow_id, profile.platform_url, profile.platform_api_key,
  );
  const { data: nodeTypesData } = useNodeTypes();

  const sourceFields = fieldsData?.fields || [];
  const nodeTypeInfo = nodeTypesData?.node_types.find((nt) => nt.type === profile.node_type);

  const eaFields = useMemo<EaField[]>(() => {
    if (!nodeTypeInfo) return [];
    return [
      ...nodeTypeInfo.core_fields.map((f) => ({ ...f, group: "Core" as const })),
      ...nodeTypeInfo.suggested_attributes.map((f) => ({ ...f, group: "Attribute" as const })),
    ];
  }, [nodeTypeInfo]);

  // Initialize from existing profile.mappings (source_field → target → fieldMap form).
  const initialMap = useMemo<FieldMap>(() => {
    const m: FieldMap = {};
    for (const { source_field, target } of profile.mappings) {
      m[target] = source_field;
    }
    return m;
  }, [profile.mappings]);

  const [fieldMap, setFieldMap] = useState<FieldMap>(initialMap);

  // Detect platform fields not yet mapped that didn't exist in the profile —
  // these are the "new columns" the user is most likely interested in.
  const previousSources = useMemo(
    () => new Set(profile.mappings.map((m) => m.source_field)),
    [profile.mappings],
  );
  const newPlatformFields = sourceFields
    .map((sf) => sf.name)
    .filter((name) => !previousSources.has(name) && !["external_id", "Created", "Modified", "LinkTitle", "LinkTitleNoMenu"].includes(name));

  const hasNameMapping = !!fieldMap["name"];

  const handleSave = async () => {
    const mappings = Object.entries(fieldMap)
      .filter(([, source]) => source)
      .map(([target, source_field]) => ({ source_field, target }));

    try {
      await save.mutateAsync({ ...profile, mappings });
      enqueueSnackbar("Mappningen sparad", { variant: "success" });
      onClose();
    } catch (err: any) {
      enqueueSnackbar(err.message || "Kunde inte spara mappningen", { variant: "error" });
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>
        Mappa om — {profile.flow_name || profile.flow_id.slice(0, 8)}
      </DialogTitle>
      <DialogContent>
        {fieldsLoading ? (
          <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}>
            <CircularProgress />
          </Box>
        ) : fieldsError ? (
          <Alert severity="error">
            Kunde inte hämta plattformsfält. Kontrollera att Integrationsplattformen är nåbar och att API-nyckeln på profilen fortfarande är giltig.
          </Alert>
        ) : !nodeTypeInfo ? (
          <Alert severity="warning">
            Okänd nodtyp "{profile.node_type}". Profilen kan inte mappas om utan en matchande nodtyp.
          </Alert>
        ) : (
          <Stack spacing={2} sx={{ mt: 1 }}>
            {newPlatformFields.length > 0 && (
              <Alert severity="success">
                <Typography variant="body2" gutterBottom sx={{ fontWeight: 600 }}>
                  {newPlatformFields.length} nya kolumn{newPlatformFields.length !== 1 ? "er" : ""} tillgänglig{newPlatformFields.length !== 1 ? "a" : ""} sedan profilen skapades:
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  {newPlatformFields.join(", ")}
                </Typography>
              </Alert>
            )}
            <MappingTable
              sourceFields={sourceFields}
              eaFields={eaFields}
              value={fieldMap}
              onChange={setFieldMap}
            />
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Avbryt</Button>
        <Button
          variant="contained"
          disabled={save.isPending || !hasNameMapping || !nodeTypeInfo}
          onClick={handleSave}
        >
          {save.isPending ? "Sparar…" : "Spara mappning"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SyncProfiles;
