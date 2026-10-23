import React, { useMemo, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Tab,
  Tabs,
  Select,
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
import AddLinkIcon from "@mui/icons-material/AddLink";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import DeleteIcon from "@mui/icons-material/Delete";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FilterListIcon from "@mui/icons-material/FilterList";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import Checkbox from "@mui/material/Checkbox";
import { useTranslation } from "react-i18next";
import { useSnackbar } from "notistack";
import { useQueryClient } from "@tanstack/react-query";
import { useNodes } from "@/api/nodes";
import { useEdges, useCreateEdge, useDeleteEdge, useUpdateEdgeDirection } from "@/api/edges";
import {
  NODE_COLORS,
  EDGE_STYLES,
  ALLOWED_CONNECTIONS,
  DEFAULT_INTEGRATION_DIRECTION,
  getIntegrationDirection,
  getValidEdgeTypes,
  getValidSourceTypes,
  getValidTargetTypes,
} from "@/config/graphConfig";
import type {
  EdgeType,
  EdgeRead,
  GraphData,
  IntegrationDirection,
  NodeRead,
  NodeType,
} from "@/types/graph";
import type { Core } from "cytoscape";
import CytoscapeGraph, { LAYOUT_OPTIONS } from "@/components/graph/CytoscapeGraph";
import GraphControls from "@/components/graph/GraphControls";
import LegendPanel from "@/components/graph/LegendPanel";
import IntegrationDirectionSelect from "@/components/graph/IntegrationDirectionSelect";

// ── Component ─────────────────────────────────────────────────────────────────

const Connections: React.FC = () => {
  const { t } = useTranslation();
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();

  const { data: nodes = [], isLoading: loadingNodes } = useNodes();
  const { data: edges = [], isLoading: loadingEdges } = useEdges();

  const nodeMap = useMemo(
    () => new Map(nodes.map((n) => [n.id, n])),
    [nodes],
  );

  const sortedNodes = useMemo(
    () => [...nodes].sort((a, b) => a.name.localeCompare(b.name)),
    [nodes],
  );

  // Form state
  const [source, setSource] = useState<NodeRead | null>(null);
  const [target, setTarget] = useState<NodeRead | null>(null);
  const [edgeType, setEdgeType] = useState<EdgeType>("USES");
  const [direction, setDirection] = useState<IntegrationDirection>(DEFAULT_INTEGRATION_DIRECTION);

  // Filter node options based on the other side's selection
  const sourceOptions = useMemo(() => {
    if (!target) return nodes;
    const valid = new Set(getValidSourceTypes(target.type));
    return nodes.filter((n) => valid.has(n.type));
  }, [nodes, target]);

  const targetOptions = useMemo(() => {
    if (!source) return nodes;
    const valid = new Set(getValidTargetTypes(source.type));
    return nodes.filter((n) => valid.has(n.type));
  }, [nodes, source]);

  // Available edge types for the current pair
  const availableFormEdgeTypes = useMemo<EdgeType[]>(() => {
    if (!source || !target) return [];
    return getValidEdgeTypes(source.type, target.type);
  }, [source, target]);

  // Tab
  const [tab, setTab] = useState(0);

  // ── Filters (shared between table & visual) ──────────────────────────────
  const [filterNodeTypes, setFilterNodeTypes] = useState<NodeType[]>([]);
  const [filterEdgeTypes, setFilterEdgeTypes] = useState<EdgeType[]>([]);
  const [filterNodeIds, setFilterNodeIds] = useState<NodeRead[]>([]);
  const [search, setSearch] = useState("");

  const ALL_NODE_TYPES: NodeType[] = ["Process", "Application", "InformationObject", "InformationSource", "TechnologyComponent", "Server", "ServerService"];
  const ALL_EDGE_TYPES: EdgeType[] = ["USES", "SUPPORTS", "HANDLES", "REALIZES", "CONTAINS", "RUNS_ON", "INTEGRATES_WITH"];

  // Filtered edges based on node type + edge type filters
  const typeFilteredEdges = useMemo(() => {
    let result = edges;
    if (filterEdgeTypes.length > 0) {
      const allowed = new Set(filterEdgeTypes);
      result = result.filter((e) => allowed.has(e.type as EdgeType));
    }
    if (filterNodeTypes.length > 0) {
      const allowed = new Set(filterNodeTypes);
      result = result.filter((e) => {
        const s = nodeMap.get(e.source_id);
        const tg = nodeMap.get(e.target_id);
        return (s && allowed.has(s.type)) || (tg && allowed.has(tg.type));
      });
    }
    if (filterNodeIds.length > 0) {
      const allowed = new Set(filterNodeIds.map((n) => n.id));
      result = result.filter((e) => allowed.has(e.source_id) || allowed.has(e.target_id));
    }
    return result;
  }, [edges, nodeMap, filterNodeTypes, filterEdgeTypes, filterNodeIds]);

  // Nodes involved in filtered edges (for visual tab)
  const filteredNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const e of typeFilteredEdges) {
      ids.add(e.source_id);
      ids.add(e.target_id);
    }
    return ids;
  }, [typeFilteredEdges]);

  const visibleEdgeIds = useMemo(
    () => new Set(typeFilteredEdges.map((e) => e.id)),
    [typeFilteredEdges],
  );

  const hasFilters = filterNodeTypes.length > 0 || filterEdgeTypes.length > 0 || filterNodeIds.length > 0;

  // Visual graph data
  const cyRef = useRef<Core | null>(null);
  const graphNodes = useMemo(() => {
    if (!hasFilters) return nodes;
    let result = nodes;
    if (filterNodeTypes.length > 0) {
      const allowed = new Set(filterNodeTypes);
      result = result.filter((n) => allowed.has(n.type));
    }
    // Narrow to nodes actually touched by the filtered edges — declutters
    // the graph to "this system and what it connects to" rather than
    // showing every unrelated node floating with no edges. The selected
    // systems themselves always stay visible, even with zero connections.
    if (filterNodeIds.length > 0) {
      const selected = new Set(filterNodeIds.map((n) => n.id));
      result = result.filter((n) => filteredNodeIds.has(n.id) || selected.has(n.id));
    }
    return result;
  }, [nodes, hasFilters, filterNodeTypes, filterNodeIds, filteredNodeIds]);

  const graphData = useMemo<GraphData>(() => ({
    nodes: graphNodes.map((n) => ({
      id: n.id,
      type: n.type,
      name: n.name,
      description: n.description,
      external_source: n.external_source,
      archived: n.archived,
      attributes: n.attributes ?? {},
    })),
    edges: typeFilteredEdges.map((e) => ({
      id: e.id,
      source: e.source_id,
      target: e.target_id,
      type: e.type as EdgeType,
      attributes: e.attributes ?? {},
    })),
  }), [graphNodes, typeFilteredEdges]);

  const effectiveEdgeType = useMemo<EdgeType | null>(
    () => (availableFormEdgeTypes.includes(edgeType) ? edgeType : availableFormEdgeTypes[0] ?? null),
    [availableFormEdgeTypes, edgeType],
  );

  const createEdge = useCreateEdge();
  const deleteEdge = useDeleteEdge();

  const handleSourceChange = (v: NodeRead | null) => {
    setSource(v);
    // If new source makes current target invalid, clear target
    if (v && target) {
      const valid = new Set(getValidTargetTypes(v.type));
      if (!valid.has(target.type)) setTarget(null);
      else {
        const types = getValidEdgeTypes(v.type, target.type);
        if (types.length > 0) setEdgeType(types[0]);
      }
    }
  };

  const handleTargetChange = (v: NodeRead | null) => {
    setTarget(v);
    // If new target makes current source invalid, clear source
    if (v && source) {
      const valid = new Set(getValidSourceTypes(v.type));
      if (!valid.has(source.type)) setSource(null);
      else {
        const types = getValidEdgeTypes(source.type, v.type);
        if (types.length > 0) setEdgeType(types[0]);
      }
    }
  };

  const handleCreate = async () => {
    if (!source || !target || !effectiveEdgeType) return;
    try {
      await createEdge.mutateAsync({
        source_id: source.id,
        target_id: target.id,
        type: effectiveEdgeType,
        ...(effectiveEdgeType === "INTEGRATES_WITH" ? { direction } : {}),
      });
      qc.invalidateQueries({ queryKey: ["views"] });
      enqueueSnackbar(t("connections.createSuccess"), { variant: "success" });
      setSource(null);
      setTarget(null);
    } catch {
      enqueueSnackbar(t("connections.error"), { variant: "error" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteEdge.mutateAsync(id);
      qc.invalidateQueries({ queryKey: ["views"] });
      enqueueSnackbar(t("connections.deleteSuccess"), { variant: "success" });
    } catch {
      enqueueSnackbar(t("connections.error"), { variant: "error" });
    }
  };

  const filteredEdges = useMemo(() => {
    if (!search.trim()) return typeFilteredEdges;
    const q = search.toLowerCase();
    return typeFilteredEdges.filter((e) => {
      const s = nodeMap.get(e.source_id);
      const tg = nodeMap.get(e.target_id);
      return (
        s?.name.toLowerCase().includes(q) ||
        tg?.name.toLowerCase().includes(q) ||
        e.type.toLowerCase().includes(q)
      );
    });
  }, [typeFilteredEdges, nodeMap, search]);

  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: "auto" }}>
      <Typography variant="h5" sx={{ mb: 0.5 }}>{t("connections.title")}</Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
        {t("connections.subtitle")}
      </Typography>

      {/* ── Tabs ── */}
      <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label={t("connections.tabs.table")} />
          <Tab label={t("connections.tabs.visual")} />
        </Tabs>
      </Box>

      {/* ── Filters ── */}
      <Paper variant="outlined" sx={{ mb: 2, p: 1.5, borderRadius: 2 }}>
        <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <FilterListIcon fontSize="small" color="action" />
          <Autocomplete
            multiple
            size="small"
            options={ALL_NODE_TYPES}
            value={filterNodeTypes}
            disableCloseOnSelect
            onChange={(_, v) => setFilterNodeTypes(v)}
            getOptionLabel={(o) => t(`nodeTypes.${o}`)}
            renderOption={(props, option, { selected }) => (
              <li {...props}>
                <Checkbox
                  icon={<CheckBoxOutlineBlankIcon fontSize="small" />}
                  checkedIcon={<CheckBoxIcon fontSize="small" />}
                  style={{ marginRight: 8 }}
                  checked={selected}
                />
                <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: NODE_COLORS[option], mr: 1, flexShrink: 0 }} />
                {t(`nodeTypes.${option}`)}
              </li>
            )}
            renderValue={(value, getItemProps) =>
              value.map((option, index) => (
                <Chip
                  {...getItemProps({ index })}
                  key={option}
                  label={t(`nodeTypes.${option}`)}
                  size="small"
                  sx={{ bgcolor: NODE_COLORS[option], color: "#fff", fontSize: 11 }}
                />
              ))
            }
            renderInput={(params) => (
              <TextField {...params} placeholder={t("connections.filter.nodeType")} />
            )}
            sx={{ minWidth: 220, flexGrow: 1, maxWidth: 400 }}
          />
          <Autocomplete
            multiple
            size="small"
            options={ALL_EDGE_TYPES}
            value={filterEdgeTypes}
            disableCloseOnSelect
            onChange={(_, v) => setFilterEdgeTypes(v)}
            getOptionLabel={(o) => t(`edgeTypes.${o}`)}
            renderOption={(props, option, { selected }) => (
              <li {...props}>
                <Checkbox
                  icon={<CheckBoxOutlineBlankIcon fontSize="small" />}
                  checkedIcon={<CheckBoxIcon fontSize="small" />}
                  style={{ marginRight: 8 }}
                  checked={selected}
                />
                <Box sx={{ width: 16, height: 3, bgcolor: EDGE_STYLES[option]?.color, mr: 1, flexShrink: 0, borderRadius: 1 }} />
                {t(`edgeTypes.${option}`)}
              </li>
            )}
            renderValue={(value, getItemProps) =>
              value.map((option, index) => (
                <Chip
                  {...getItemProps({ index })}
                  key={option}
                  label={t(`edgeTypes.${option}`)}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: 11 }}
                />
              ))
            }
            renderInput={(params) => (
              <TextField {...params} placeholder={t("connections.filter.edgeType")} />
            )}
            sx={{ minWidth: 220, flexGrow: 1, maxWidth: 400 }}
          />
          <Autocomplete
            multiple
            size="small"
            options={sortedNodes}
            value={filterNodeIds}
            disableCloseOnSelect
            onChange={(_, v) => setFilterNodeIds(v)}
            getOptionLabel={(o) => o.name}
            groupBy={(o) => t(`nodeTypes.${o.type}`)}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderOption={(props, option, { selected }) => (
              <li {...props}>
                <Checkbox
                  icon={<CheckBoxOutlineBlankIcon fontSize="small" />}
                  checkedIcon={<CheckBoxIcon fontSize="small" />}
                  style={{ marginRight: 8 }}
                  checked={selected}
                />
                <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: NODE_COLORS[option.type], mr: 1, flexShrink: 0 }} />
                {option.name}
              </li>
            )}
            renderValue={(value, getItemProps) =>
              value.map((option, index) => (
                <Chip
                  {...getItemProps({ index })}
                  key={option.id}
                  label={option.name}
                  size="small"
                  sx={{ bgcolor: NODE_COLORS[option.type], color: "#fff", fontSize: 11 }}
                />
              ))
            }
            renderInput={(params) => (
              <TextField {...params} placeholder={t("connections.filter.system")} />
            )}
            sx={{ minWidth: 220, flexGrow: 1, maxWidth: 400 }}
          />
          {hasFilters && (
            <Button size="small" onClick={() => { setFilterNodeTypes([]); setFilterEdgeTypes([]); setFilterNodeIds([]); }}>
              {t("connections.filter.clear")}
            </Button>
          )}
        </Stack>
        {hasFilters && (
          <Typography variant="caption" sx={{ color: "text.secondary", mt: 0.5, display: "block" }}>
            {t("connections.filter.showing", { edges: typeFilteredEdges.length, total: edges.length })}
          </Typography>
        )}
      </Paper>

      {tab === 1 && (
        <Box sx={{ flexGrow: 1, position: "relative", height: "calc(100vh - 320px)", minHeight: 400 }}>
          {(loadingNodes || loadingEdges) ? (
            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
              <CircularProgress />
            </Box>
          ) : graphData.nodes.length === 0 ? (
            <Box sx={{ p: 4, textAlign: "center" }}>
              <Typography sx={{ color: "text.secondary" }}>
                {t("connections.noConnections")}
              </Typography>
            </Box>
          ) : (
            <>
              <CytoscapeGraph data={graphData} layout="cose" height="100%" cyRef={cyRef} positionKey="connections" />
              <GraphControls cyRef={cyRef} graphName="connections" positionKey="connections" defaultLayout={LAYOUT_OPTIONS.cose} />
              <Box sx={{ position: "absolute", bottom: 16, left: 16 }}>
                <LegendPanel />
              </Box>
            </>
          )}
        </Box>
      )}

      {tab === 0 && <>

      {/* ── Create connection ── */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1.5 }}>
            <AddLinkIcon sx={{ color: "primary.main" }} />
            <Typography variant="h6" sx={{ fontSize: 16, fontWeight: 600 }}>
              {t("connections.createSection.title")}
            </Typography>
          </Stack>
          <Divider sx={{ mb: 2.5 }} />

          <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ alignItems: { md: "center" } }}>
            {/* Source — filtered to only nodes that have at least one valid target */}
            <NodeAutocomplete
              label={t("connections.createSection.source")}
              options={sourceOptions}
              loading={loadingNodes}
              value={source}
              onChange={handleSourceChange}
              t={t}
            />

            {/* Edge type — only valid types for this pair */}
            <FormControl
              size="small"
              sx={{ minWidth: 180, flexShrink: 0 }}
              disabled={availableFormEdgeTypes.length === 0}
            >
              <InputLabel>{t("connections.createSection.edgeType")}</InputLabel>
              <Select
                label={t("connections.createSection.edgeType")}
                value={effectiveEdgeType ?? ""}
                onChange={(e) => setEdgeType(e.target.value as EdgeType)}
              >
                {availableFormEdgeTypes.map((et) => (
                  <MenuItem key={et} value={et}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: EDGE_STYLES[et]?.color, flexShrink: 0 }} />
                      <span>{t(`edgeTypes.${et}`)}</span>
                    </Stack>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Target — filtered to only valid targets for the selected source */}
            <NodeAutocomplete
              label={t("connections.createSection.target")}
              options={targetOptions}
              loading={loadingNodes}
              value={target}
              onChange={handleTargetChange}
              t={t}
            />

            <Button
              variant="contained"
              onClick={handleCreate}
              disabled={!source || !target || availableFormEdgeTypes.length === 0 || createEdge.isPending}
              startIcon={createEdge.isPending ? <CircularProgress size={16} color="inherit" /> : <AddLinkIcon />}
              sx={{ flexShrink: 0, height: 40 }}
            >
              {t("connections.createSection.create")}
            </Button>
          </Stack>

          {/* Direction — an integration runs one way, the other, or both. Spelled
              out with the two system names so nobody has to guess what → means. */}
          {effectiveEdgeType === "INTEGRATES_WITH" && (
            <Box sx={{ mt: 2.5, pt: 2, borderTop: 1, borderColor: "divider" }}>
              <IntegrationDirectionSelect
                variant="verbose"
                value={direction}
                onChange={setDirection}
                sourceName={source?.name}
                targetName={target?.name}
              />
            </Box>
          )}

          {source && target && availableFormEdgeTypes.length === 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {t("connections.graph.invalidTarget")}
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* ── Connection guide ── */}
      <ConnectionGuide />

      {/* ── Existing connections ── */}
      <Card>
        <CardContent>
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
            <Typography variant="h6" sx={{ fontSize: 16, fontWeight: 600 }}>
              {t("connections.listSection.title")}
              {!loadingEdges && (
                <Typography component="span" variant="body2" sx={{ color: "text.secondary", ml: 1 }}>
                  ({edges.length})
                </Typography>
              )}
            </Typography>
            <TextField
              size="small"
              placeholder={t("common.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ width: 220 }}
            />
          </Stack>
          <Divider sx={{ mb: 2 }} />

          {loadingEdges ? (
            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : filteredEdges.length === 0 ? (
            <Typography align="center" sx={{ color: "text.secondary", py: 4 }}>
              {t("connections.listSection.noData")}
            </Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 520 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>{t("connections.listSection.source")}</TableCell>
                    <TableCell align="center" sx={{ width: 160 }}>
                      {t("connections.listSection.type")}
                    </TableCell>
                    <TableCell>{t("connections.listSection.target")}</TableCell>
                    <TableCell sx={{ width: 52 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredEdges.map((edge) => (
                    <EditableConnectionRow
                      key={edge.id}
                      edge={edge}
                      nodeMap={nodeMap}
                      nodes={nodes}
                      t={t}
                      onDelete={() => handleDelete(edge.id)}
                      deleting={deleteEdge.isPending}
                    />
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
      </>}
    </Box>
  );
};

// ── Editable connection row ────────────────────────────────────────────────────


function EditableConnectionRow({
  edge, nodeMap, nodes, t, onDelete, deleting,
}: {
  edge: EdgeRead;
  nodeMap: Map<string, NodeRead>;
  nodes: NodeRead[];
  t: (k: string) => string;
  onDelete: () => void;
  deleting: boolean;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  const createEdge = useCreateEdge();
  const deleteEdge = useDeleteEdge();
  const updateDirection = useUpdateEdgeDirection();

  const [editing, setEditing] = useState<"source" | "target" | null>(null);
  const [replaceNode, setReplaceNode] = useState<NodeRead | null>(null);

  const src = nodeMap.get(edge.source_id);
  const tgt = nodeMap.get(edge.target_id);
  const direction = getIntegrationDirection(edge.type as EdgeType, edge.attributes);

  const handleDirectionChange = async (next: IntegrationDirection) => {
    try {
      await updateDirection.mutateAsync({ id: edge.id, direction: next });
      qc.invalidateQueries({ queryKey: ["views"] });
      enqueueSnackbar(t("connections.directionSuccess"), { variant: "success" });
    } catch {
      enqueueSnackbar(t("connections.error"), { variant: "error" });
    }
  };

  // Filter valid replacements based on edge type
  const replaceOptions = useMemo(() => {
    if (!editing) return [];
    if (editing === "source" && tgt) {
      return nodes.filter((n) => n.id !== edge.source_id && getValidEdgeTypes(n.type, tgt.type).includes(edge.type as EdgeType));
    }
    if (editing === "target" && src) {
      return nodes.filter((n) => n.id !== edge.target_id && getValidEdgeTypes(src.type, n.type).includes(edge.type as EdgeType));
    }
    return [];
  }, [editing, nodes, edge, src, tgt]);

  const handleReplace = async () => {
    if (!replaceNode || !editing) return;
    try {
      const newSource = editing === "source" ? replaceNode.id : edge.source_id;
      const newTarget = editing === "target" ? replaceNode.id : edge.target_id;
      await createEdge.mutateAsync({
        source_id: newSource,
        target_id: newTarget,
        type: edge.type as EdgeType,
        ...(direction ? { direction } : {}),
      });
      await deleteEdge.mutateAsync(edge.id);
      qc.invalidateQueries({ queryKey: ["views"] });
      enqueueSnackbar(t("connections.replaceSuccess"), { variant: "success" });
      setEditing(null);
      setReplaceNode(null);
    } catch {
      enqueueSnackbar(t("connections.error"), { variant: "error" });
    }
  };

  const isPending = createEdge.isPending || deleteEdge.isPending;

  if (editing) {
    return (
      <TableRow>
        <TableCell colSpan={4}>
          <Stack spacing={1.5} sx={{ py: 1 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600 }}>
                {editing === "source" ? t("connections.replaceSource") : t("connections.replaceTarget")}
              </Typography>
              <Chip
                label={editing === "source" ? src?.name : tgt?.name}
                size="small"
                variant="outlined"
                sx={{ fontSize: 11 }}
              />
              <SwapHorizIcon sx={{ fontSize: 16, color: "text.secondary" }} />
            </Stack>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Autocomplete
                sx={{ flexGrow: 1, minWidth: 220 }}
                size="small"
                options={replaceOptions}
                value={replaceNode}
                onChange={(_, v) => setReplaceNode(v)}
                getOptionLabel={(o) => o.name}
                groupBy={(o) => t(`nodeTypes.${o.type}`)}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                renderOption={(props, option) => (
                  <Box component="li" {...props} key={option.id}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: NODE_COLORS[option.type], flexShrink: 0 }} />
                      <Typography variant="body2">{option.name}</Typography>
                    </Stack>
                  </Box>
                )}
                renderInput={(params) => (
                  <TextField {...params} label={t("connections.replaceWith")} size="small" autoFocus />
                )}
              />
              <Button
                size="small" variant="contained"
                disabled={!replaceNode || isPending}
                onClick={handleReplace}
                startIcon={isPending ? <CircularProgress size={14} color="inherit" /> : <SwapHorizIcon />}
              >
                {t("connections.replaceSave")}
              </Button>
              <Button size="small" onClick={() => { setEditing(null); setReplaceNode(null); }}>
                {t("common.cancel")}
              </Button>
            </Stack>
          </Stack>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow hover>
      <TableCell>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
          <NodeCell node={src} fallback={edge.source_id} t={t} />
          <IconButton size="small" onClick={() => setEditing("source")} title={t("connections.replaceSource")}>
            <SwapHorizIcon sx={{ fontSize: 14, color: "action.active" }} />
          </IconButton>
        </Stack>
      </TableCell>
      <TableCell align="center">
        <Stack spacing={0.5} sx={{ alignItems: "center" }}>
          <Tooltip title={t(`edgeTypeDescriptions.${edge.type}`)} placement="top">
            <Chip
              label={t(`edgeTypes.${edge.type}`)}
              size="small"
              variant="outlined"
              sx={{ fontSize: 11, cursor: "help" }}
            />
          </Tooltip>
          {direction && (
            <IntegrationDirectionSelect
              value={direction}
              onChange={handleDirectionChange}
              sourceName={src?.name}
              targetName={tgt?.name}
              disabled={updateDirection.isPending}
            />
          )}
        </Stack>
      </TableCell>
      <TableCell>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
          <NodeCell node={tgt} fallback={edge.target_id} t={t} />
          <IconButton size="small" onClick={() => setEditing("target")} title={t("connections.replaceTarget")}>
            <SwapHorizIcon sx={{ fontSize: 14, color: "action.active" }} />
          </IconButton>
        </Stack>
      </TableCell>
      <TableCell align="right">
        <IconButton
          size="small"
          color="error"
          onClick={onDelete}
          disabled={deleting}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </TableCell>
    </TableRow>
  );
}

// ── Connection guide ───────────────────────────────────────────────────────────

function ConnectionGuide() {
  const { t } = useTranslation();

  // Build rows from ALLOWED_CONNECTIONS: { sourceType, edgeType, targetType, description }
  const rows = useMemo(() => {
    const result: { sourceType: NodeType; edgeType: EdgeType; targetType: NodeType }[] = [];
    for (const [srcType, targets] of Object.entries(ALLOWED_CONNECTIONS) as [NodeType, Partial<Record<NodeType, EdgeType[]>>][]) {
      for (const [tgtType, etypes] of Object.entries(targets) as [NodeType, EdgeType[]][]) {
        for (const et of etypes) {
          result.push({ sourceType: srcType, edgeType: et, targetType: tgtType });
        }
      }
    }
    return result;
  }, []);

  return (
    <Accordion variant="outlined" sx={{ mb: 2 }} disableGutters>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <InfoOutlinedIcon fontSize="small" color="action" />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{t("connections.guide.title")}</Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ p: 0 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: "action.hover" }}>
                <TableCell sx={{ fontWeight: 600 }}>{t("connections.createSection.source")}</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 160 }}>{t("connections.createSection.edgeType")}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{t("connections.createSection.target")}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{t("common.description")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(({ sourceType, edgeType, targetType }) => (
                <TableRow key={`${sourceType}-${edgeType}-${targetType}`} hover>
                  <TableCell>
                    <Chip
                      size="small"
                      label={t(`nodeTypes.${sourceType}`)}
                      sx={{ bgcolor: NODE_COLORS[sourceType], color: "#fff", fontSize: 11 }}
                    />
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                      <Box sx={{ width: 20, height: 2, bgcolor: EDGE_STYLES[edgeType]?.color }} />
                      <Typography variant="body2" sx={{ fontSize: 12 }}>{t(`edgeTypes.${edgeType}`)}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={t(`nodeTypes.${targetType}`)}
                      sx={{ bgcolor: NODE_COLORS[targetType], color: "#fff", fontSize: 11 }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ color: "text.secondary", fontSize: 12 }}>
                      {t(`edgeTypeDescriptions.${edgeType}`)}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </AccordionDetails>
    </Accordion>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function NodeAutocomplete({
  label, options, loading, value, onChange, t,
}: {
  label: string;
  options: NodeRead[];
  loading: boolean;
  value: NodeRead | null;
  onChange: (v: NodeRead | null) => void;
  t: (k: string) => string;
}) {
  return (
    <Autocomplete
      sx={{ flexGrow: 1, minWidth: 220 }}
      options={options}
      loading={loading}
      value={value}
      onChange={(_, v) => onChange(v)}
      getOptionLabel={(o) => o.name}
      groupBy={(o) => t(`nodeTypes.${o.type}`)}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      renderOption={(props, option) => (
        <Box component="li" {...props} key={option.id}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Box
              sx={{
                width: 10, height: 10, borderRadius: "50%",
                bgcolor: NODE_COLORS[option.type], flexShrink: 0,
              }}
            />
            <Typography variant="body2">{option.name}</Typography>
          </Stack>
        </Box>
      )}
      renderInput={(params) => (
        <TextField {...params} label={label} size="small" />
      )}
    />
  );
}

function NodeCell({
  node, fallback, t,
}: {
  node: NodeRead | undefined;
  fallback: string;
  t: (k: string) => string;
}) {
  if (!node) {
    return (
      <Typography variant="body2" sx={{ color: "text.disabled", fontFamily: "monospace", fontSize: 11 }}>
        {fallback}
      </Typography>
    );
  }
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
      <Box
        sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: NODE_COLORS[node.type], flexShrink: 0 }}
      />
      <Typography variant="body2" sx={{ fontWeight: 500 }}>{node.name}</Typography>
      <Chip
        label={t(`nodeTypes.${node.type}`)}
        size="small"
        sx={{ height: 16, fontSize: 10 }}
      />
    </Stack>
  );
}

export default Connections;
