import React, { useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import AddLinkIcon from "@mui/icons-material/AddLink";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { useTranslation } from "react-i18next";
import { useSnackbar } from "notistack";
import { useCreateNode, useNodes } from "@/api/nodes";
import { useCreateEdge } from "@/api/edges";
import { useQueryClient } from "@tanstack/react-query";
import type { EdgeType, IntegrationDirection, NodeRead, NodeType } from "@/types/graph";
import {
  NODE_COLORS,
  EDGE_STYLES,
  ATTR_FIELDS,
  DEFAULT_INTEGRATION_DIRECTION,
  getValidEdgeTypes,
  getValidTargetTypes,
  getValidSourceTypes,
} from "@/config/graphConfig";
import IntegrationDirectionSelect from "@/components/graph/IntegrationDirectionSelect";
import { useRoleStore } from "@/store/roleStore";

const DEFINITION_KEYS: Record<NodeType, string> = {
  Process: "process",
  Application: "application",
  InformationObject: "informationObject",
  InformationSource: "informationSource",
  TechnologyComponent: "technologyComponent",
  Server: "server",
  ServerService: "serverService",
};

const NODE_TYPES: NodeType[] = [
  "Process",
  "Application",
  "InformationObject",
  "InformationSource",
  "TechnologyComponent",
  "Server",
  "ServerService",
];

// ── Pending connection type ────────────────────────────────────────────────

interface PendingConnection {
  id: number;
  /** Which end the new node sits on — "to" makes it the edge source. */
  direction: "from" | "to";
  node: NodeRead | null;
  edgeType: EdgeType | "";
  /** Only used when edgeType is INTEGRATES_WITH. */
  integrationDirection: IntegrationDirection;
}

let connIdCounter = 0;

// ── Component ──────────────────────────────────────────────────────────────

const CreateNode: React.FC = () => {
  const { t } = useTranslation();
  // Servers are created by those with edit access to Servrar.
  const typeAccess = useRoleStore((st) => st.typeAccess);
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();

  const createNode = useCreateNode();
  const createEdge = useCreateEdge();
  const { data: existingNodes = [], isLoading: loadingNodes } = useNodes();

  // Form state
  const [nodeType, setNodeType] = useState<NodeType>("Application");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [attrs, setAttrs] = useState<Record<string, string>>({});
  const [parentProcess, setParentProcess] = useState<NodeRead | null>(null);
  const [connections, setConnections] = useState<PendingConnection[]>([]);
  const [created, setCreated] = useState<NodeRead | null>(null);

  const attrFields = ATTR_FIELDS[nodeType];

  // Reset form when type changes
  const handleTypeChange = (type: NodeType) => {
    setNodeType(type);
    setAttrs({});
    setParentProcess(null);
    setConnections([]);
    setCreated(null);
  };

  const setAttr = (key: string, value: string) =>
    setAttrs((prev) => ({ ...prev, [key]: value }));

  // ── Connection helpers ────────────────────────────────────────────────────

  const addConnection = () => {
    setConnections((prev) => [
      ...prev,
      {
        id: ++connIdCounter,
        direction: "to",
        node: null,
        edgeType: "",
        integrationDirection: DEFAULT_INTEGRATION_DIRECTION,
      },
    ]);
  };

  const updateConnection = (id: number, patch: Partial<PendingConnection>) => {
    setConnections((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const updated = { ...c, ...patch };
        // Auto-select edge type when direction + node set
        if (updated.node && (patch.node !== undefined || patch.direction !== undefined)) {
          const types =
            updated.direction === "to"
              ? getValidEdgeTypes(nodeType, updated.node.type)
              : getValidEdgeTypes(updated.node.type, nodeType);
          updated.edgeType = types[0] ?? "";
        }
        return updated;
      }),
    );
  };

  const removeConnection = (id: number) =>
    setConnections((prev) => prev.filter((c) => c.id !== id));

  // Filter available targets/sources based on the current nodeType
  const getNodeOptions = (direction: "from" | "to"): NodeRead[] => {
    if (direction === "to") {
      const validTypes = new Set(getValidTargetTypes(nodeType));
      return existingNodes.filter((n) => validTypes.has(n.type));
    }
    const validTypes = new Set(getValidSourceTypes(nodeType));
    return existingNodes.filter((n) => validTypes.has(n.type));
  };

  const getEdgeTypeOptions = (conn: PendingConnection): EdgeType[] => {
    if (!conn.node) return [];
    return conn.direction === "to"
      ? getValidEdgeTypes(nodeType, conn.node.type)
      : getValidEdgeTypes(conn.node.type, nodeType);
  };

  // Check which directions are valid for the selected nodeType
  const canConnectTo = getValidTargetTypes(nodeType).length > 0;
  const canConnectFrom = getValidSourceTypes(nodeType).length > 0;

  // ── Submit ────────────────────────────────────────────────────────────────

  const canSubmit = name.trim().length > 0 && !createNode.isPending;

  const handleSubmit = async () => {
    try {
      const attributes: Record<string, unknown> = {};
      for (const { key } of attrFields) {
        if (attrs[key]?.trim()) attributes[key] = attrs[key].trim();
      }
      if (nodeType === "Process" && parentProcess) {
        attributes.parent_id = parentProcess.id;
      }

      const node = await createNode.mutateAsync({
        type: nodeType,
        name: name.trim(),
        description: description.trim() || undefined,
        attributes,
      });

      // Create connections
      const validConns = connections.filter((c) => c.node && c.edgeType);
      for (const conn of validConns) {
        try {
          await createEdge.mutateAsync({
            source_id: conn.direction === "to" ? node.id : conn.node!.id,
            target_id: conn.direction === "to" ? conn.node!.id : node.id,
            type: conn.edgeType as EdgeType,
            ...(conn.edgeType === "INTEGRATES_WITH"
              ? { direction: conn.integrationDirection }
              : {}),
          });
        } catch {
          enqueueSnackbar(
            `${t("createNode.connectionError")}: ${conn.node!.name}`,
            { variant: "warning" },
          );
        }
      }

      qc.invalidateQueries({ queryKey: ["views"] });
      setCreated(node);
      enqueueSnackbar(t("createNode.success"), { variant: "success" });

      // Reset form
      setName("");
      setDescription("");
      setAttrs({});
      setParentProcess(null);
      setConnections([]);
    } catch {
      enqueueSnackbar(t("createNode.error"), { variant: "error" });
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: "auto" }}>
      <Typography variant="h5" mb={0.5}>{t("createNode.title")}</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        {t("createNode.subtitle")}
      </Typography>

      {/* ── Success banner ── */}
      <Collapse in={!!created}>
        {created && (
          <Alert
            severity="success"
            icon={<CheckCircleIcon />}
            sx={{ mb: 2 }}
            onClose={() => setCreated(null)}
          >
            <strong>{created.name}</strong> ({t(`nodeTypes.${created.type}`)}) {t("createNode.createdMessage")}
          </Alert>
        )}
      </Collapse>

      {/* ── Node type selector ── */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle2" mb={1.5}>{t("common.type")}</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {NODE_TYPES.filter((nt) => typeAccess[nt] === "edit").map((nt) => (
              <Chip
                key={nt}
                label={t(`nodeTypes.${nt}`)}
                onClick={() => handleTypeChange(nt)}
                variant={nodeType === nt ? "filled" : "outlined"}
                sx={{
                  bgcolor: nodeType === nt ? NODE_COLORS[nt] : undefined,
                  color: nodeType === nt ? "#fff" : undefined,
                  borderColor: NODE_COLORS[nt],
                  "&:hover": { bgcolor: NODE_COLORS[nt], color: "#fff", opacity: 0.85 },
                }}
              />
            ))}
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, fontStyle: "italic", fontSize: 12 }}>
            {t(`home.definitions.${DEFINITION_KEYS[nodeType]}`)}
          </Typography>
        </CardContent>
      </Card>

      {/* ── Core fields ── */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle2" mb={1.5}>{t("createNode.details")}</Typography>

          <TextField
            fullWidth size="small" label={t("common.name")} required
            value={name} onChange={(e) => setName(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth size="small" label={t("common.description")} multiline minRows={2}
            value={description} onChange={(e) => setDescription(e.target.value)}
            sx={{ mb: 2 }}
          />

          {attrFields.length > 0 && (
            <>
              <Divider sx={{ my: 1.5 }} />
              <Typography variant="caption" color="text.secondary" mb={1} display="block">
                {t("createNode.attributes")}
              </Typography>
              <Stack spacing={1.5}>
                {attrFields.map(({ key, labelKey }) => (
                  <TextField
                    key={key}
                    fullWidth size="small"
                    label={t(labelKey)}
                    value={attrs[key] ?? ""}
                    onChange={(e) => setAttr(key, e.target.value)}
                  />
                ))}
              </Stack>
            </>
          )}

          {nodeType === "Process" && (
            <>
              <Divider sx={{ my: 1.5 }} />
              <Typography variant="caption" color="text.secondary" mb={1} display="block">
                {t("createNode.parentProcess")}
              </Typography>
              <Autocomplete
                size="small"
                options={existingNodes.filter((n) => n.type === "Process")}
                loading={loadingNodes}
                value={parentProcess}
                onChange={(_, v) => setParentProcess(v)}
                getOptionLabel={(o) => o.name}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                renderOption={(props, option) => (
                  <Box component="li" {...props} key={option.id}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: NODE_COLORS.Process, flexShrink: 0 }} />
                      <Typography variant="body2">{option.name}</Typography>
                    </Stack>
                  </Box>
                )}
                renderInput={(params) => (
                  <TextField {...params} placeholder={t("createNode.selectParentProcess")} />
                )}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Optional connections ── */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
            <Stack direction="row" spacing={1} alignItems="center">
              <AddLinkIcon sx={{ color: "primary.main", fontSize: 20 }} />
              <Typography variant="subtitle2">{t("createNode.connectionsTitle")}</Typography>
            </Stack>
            <Button
              size="small"
              startIcon={<AddLinkIcon />}
              onClick={addConnection}
              disabled={!canConnectTo && !canConnectFrom}
            >
              {t("createNode.addConnection")}
            </Button>
          </Stack>

          {connections.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
              {t("createNode.noConnections")}
            </Typography>
          )}

          <Stack spacing={2}>
            {connections.map((conn) => {
              const edgeOptions = getEdgeTypeOptions(conn);
              const connEdgeType = edgeOptions.includes(conn.edgeType as EdgeType)
                ? conn.edgeType
                : edgeOptions[0];
              // The new node is one end of the edge; "to" puts it on the source side.
              const newNodeLabel = name.trim() || t(`nodeTypes.${nodeType}`);
              return (
                <Paper key={conn.id} variant="outlined" sx={{ p: 1.5 }}>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
                    {/* Direction */}
                    <FormControl size="small" sx={{ minWidth: 100 }}>
                      <InputLabel>{t("createNode.direction")}</InputLabel>
                      <Select
                        label={t("createNode.direction")}
                        value={conn.direction}
                        onChange={(e) =>
                          updateConnection(conn.id, {
                            direction: e.target.value as "from" | "to",
                            node: null,
                            edgeType: "",
                          })
                        }
                      >
                        {canConnectTo && (
                          <MenuItem value="to">{t("createNode.directionTo")}</MenuItem>
                        )}
                        {canConnectFrom && (
                          <MenuItem value="from">{t("createNode.directionFrom")}</MenuItem>
                        )}
                      </Select>
                    </FormControl>

                    {/* Target/source node */}
                    <Autocomplete
                      sx={{ flexGrow: 1, minWidth: 200 }}
                      options={getNodeOptions(conn.direction)}
                      loading={loadingNodes}
                      value={conn.node}
                      onChange={(_, v) => updateConnection(conn.id, { node: v })}
                      getOptionLabel={(o) => o.name}
                      groupBy={(o) => t(`nodeTypes.${o.type}`)}
                      isOptionEqualToValue={(a, b) => a.id === b.id}
                      renderOption={(props, option) => (
                        <Box component="li" {...props} key={option.id}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: NODE_COLORS[option.type], flexShrink: 0 }} />
                            <Typography variant="body2">{option.name}</Typography>
                          </Stack>
                        </Box>
                      )}
                      renderInput={(params) => (
                        <TextField {...params} label={t("createNode.selectNode")} size="small" />
                      )}
                    />

                    {/* Edge type */}
                    <FormControl size="small" sx={{ minWidth: 160 }} disabled={edgeOptions.length === 0}>
                      <InputLabel>{t("connections.createSection.edgeType")}</InputLabel>
                      <Select
                        label={t("connections.createSection.edgeType")}
                        value={connEdgeType ?? ""}
                        onChange={(e) => updateConnection(conn.id, { edgeType: e.target.value as EdgeType })}
                      >
                        {edgeOptions.map((et) => (
                          <MenuItem key={et} value={et}>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: EDGE_STYLES[et]?.color, flexShrink: 0 }} />
                              <span>{t(`edgeTypes.${et}`)}</span>
                            </Stack>
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    {/* Remove */}
                    <IconButton size="small" color="error" onClick={() => removeConnection(conn.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>

                  {/* Direction — spelled out with both system names */}
                  {connEdgeType === "INTEGRATES_WITH" && (
                    <Box sx={{ mt: 1.5, pt: 1.5, borderTop: 1, borderColor: "divider" }}>
                      <IntegrationDirectionSelect
                        variant="verbose"
                        value={conn.integrationDirection}
                        onChange={(d) => updateConnection(conn.id, { integrationDirection: d })}
                        sourceName={conn.direction === "to" ? newNodeLabel : conn.node?.name}
                        targetName={conn.direction === "to" ? conn.node?.name : newNodeLabel}
                      />
                    </Box>
                  )}
                </Paper>
              );
            })}
          </Stack>
        </CardContent>
      </Card>

      {/* ── Submit ── */}
      <Button
        variant="contained"
        size="large"
        fullWidth
        onClick={handleSubmit}
        disabled={!canSubmit}
        startIcon={createNode.isPending ? <CircularProgress size={18} color="inherit" /> : <AddCircleOutlineIcon />}
      >
        {t("createNode.submit")}
      </Button>
    </Box>
  );
};

export default CreateNode;
