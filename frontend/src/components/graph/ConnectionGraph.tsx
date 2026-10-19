/**
 * Interactive graph for creating and deleting connections.
 *
 * Interaction model:
 *   1. Click a node → it becomes the "source" (highlighted orange).
 *      Invalid target nodes are dimmed immediately.
 *   2. Click a valid target node → edge-type dialog opens (only valid types shown).
 *   3. Click an invalid target → a brief warning is shown, nothing happens.
 *   4. Confirm dialog → connection is created via onCreate().
 *   5. Click canvas background or Escape → cancel source selection.
 *   6. Click an edge → floating panel appears with a delete button.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import cytoscape from "cytoscape";
import type { Core } from "cytoscape";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import CancelIcon from "@mui/icons-material/Cancel";
import BlockIcon from "@mui/icons-material/Block";
import { useTranslation } from "react-i18next";
import type { EdgeType, NodeRead, EdgeRead } from "@/types/graph";
import {
  NODE_COLORS,
  NODE_BORDER_COLORS,
  NODE_SHAPES,
  EDGE_STYLES,
  getEdgeArrows,
  cytoscapeStylesheet,
  getValidEdgeTypes,
  getValidTargetTypes,
} from "@/config/graphConfig";
import { savePositions, getPositions } from "./positionCache";
import GraphControls from "./GraphControls";
import LegendPanel from "./LegendPanel";

// ── Constants ─────────────────────────────────────────────────────────────────

const COSE_LAYOUT: cytoscape.LayoutOptions = {
  name: "cose",
  animate: false,
  randomize: true,
  nodeRepulsion: () => 500000,
  padding: 48,
} as cytoscape.LayoutOptions;

const SOURCE_STYLE   = { "border-color": "#FF6B35", "border-width": 5, "opacity": 1 };
const DIM_STYLE      = { "opacity": 0.2 };
const ACTIVE_STYLE   = { "opacity": 1 };

// ── Element builders ──────────────────────────────────────────────────────────

function buildNodeData(n: NodeRead) {
  return {
    id: n.id,
    label: n.name,
    type: n.type,
    bgColor: NODE_COLORS[n.type] ?? "#999",
    borderColor: NODE_BORDER_COLORS[n.type] ?? "#666",
    shape: NODE_SHAPES[n.type] ?? "ellipse",
    nodeData: n,
  };
}

function buildEdgeData(e: EdgeRead, translate: (key: string) => string) {
  const style = EDGE_STYLES[e.type] ?? EDGE_STYLES.USES;
  const arrows = getEdgeArrows(e.type, e.attributes);
  return {
    id: e.id,
    source: e.source_id,
    target: e.target_id,
    label: translate(`edgeTypes.${e.type}`),
    color: style.color,
    lineStyle: style.lineStyle,
    width: style.width,
    sourceArrow: arrows.sourceArrow,
    targetArrow: arrows.targetArrow,
    edgeData: e,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  nodes: NodeRead[];
  edges: EdgeRead[];
  /** When set, only these node/edge IDs are visible; the rest are hidden. */
  visibleNodeIds?: Set<string> | null;
  visibleEdgeIds?: Set<string> | null;
  onCreate: (sourceId: string, targetId: string, type: EdgeType) => Promise<void>;
  onDelete: (edgeId: string) => Promise<void>;
  creating: boolean;
  deleting: boolean;
}

const ConnectionGraph: React.FC<Props> = ({
  nodes, edges, visibleNodeIds, visibleEdgeIds, onCreate, onDelete, creating, deleting,
}) => {
  const { t } = useTranslation();
  const cyRef       = useRef<Core | null>(null);
  const initialised = useRef(false);
  const [cyReady, setCyReady] = useState(false);

  // Source selection — ref for stable handlers, state for re-renders
  const pendingSourceRef = useRef<NodeRead | null>(null);
  const [pendingSource, _setPendingSource] = useState<NodeRead | null>(null);
  const setPendingSource = (n: NodeRead | null) => {
    pendingSourceRef.current = n;
    _setPendingSource(n);
  };

  // Dialog
  const [dialogOpen, setDialogOpen]     = useState(false);
  const dialogTargetRef                  = useRef<NodeRead | null>(null);
  const [dialogTarget, setDialogTarget] = useState<NodeRead | null>(null);
  const [availableEdgeTypes, setAvailableEdgeTypes] = useState<EdgeType[]>([]);
  const [selectedEdgeType, setSelectedEdgeType]     = useState<EdgeType>("USES");

  // Invalid-target feedback
  const [invalidMsg, setInvalidMsg] = useState(false);

  // Selected edge (for delete panel)
  const [selectedEdge, setSelectedEdge] = useState<EdgeRead | null>(null);

  // ── Highlight / dim helpers ─────────────────────────────────────────────────

  const highlightValidTargets = useCallback((sourceType: NodeRead["type"]) => {
    const cy = cyRef.current;
    if (!cy) return;
    const validTypes = new Set(getValidTargetTypes(sourceType));
    cy.nodes().forEach((node) => {
      const nd: NodeRead = node.data("nodeData");
      if (!nd || nd.id === pendingSourceRef.current?.id) return;
      node.style(validTypes.has(nd.type) ? ACTIVE_STYLE : DIM_STYLE);
    });
  }, []);

  const restoreNodeStyles = useCallback(() => {
    cyRef.current?.nodes().style(ACTIVE_STYLE);
  }, []);

  // ── Cancel source selection ─────────────────────────────────────────────────

  const cancelSource = useCallback(() => {
    const cy  = cyRef.current;
    const src = pendingSourceRef.current;
    if (cy && src) {
      cy.getElementById(src.id).style({
        "border-color": NODE_BORDER_COLORS[src.type] ?? "#666",
        "border-width": 2,
      });
    }
    restoreNodeStyles();
    setPendingSource(null);
    setInvalidMsg(false);
  }, [restoreNodeStyles]);

  // ── Stable Cytoscape event handlers ────────────────────────────────────────

  const handleNodeTap = useCallback((evt: cytoscape.EventObject) => {
    const n: NodeRead = evt.target.data("nodeData");
    if (!n) return;

    const src = pendingSourceRef.current;

    if (!src) {
      // First click — select as source
      setPendingSource(n);
      evt.target.style(SOURCE_STYLE);
      setSelectedEdge(null);
      setInvalidMsg(false);
      highlightValidTargets(n.type);
      return;
    }

    if (src.id === n.id) {
      // Same node clicked again — cancel
      cancelSource();
      return;
    }

    // Second click — check if this target is valid
    const validTypes = getValidEdgeTypes(src.type, n.type);
    if (validTypes.length === 0) {
      // Invalid combination — flash warning, keep source selected
      setInvalidMsg(true);
      setTimeout(() => setInvalidMsg(false), 2500);
      return;
    }

    // Valid target — open dialog
    dialogTargetRef.current = n;
    setDialogTarget(n);
    setAvailableEdgeTypes(validTypes);
    setSelectedEdgeType(validTypes[0]);
    setDialogOpen(true);
  }, [cancelSource, highlightValidTargets]);

  const handleEdgeTap = useCallback((evt: cytoscape.EventObject) => {
    const e: EdgeRead = evt.target.data("edgeData");
    if (e) { setSelectedEdge(e); cancelSource(); }
  }, [cancelSource]);

  const handleBgTap = useCallback((evt: cytoscape.EventObject) => {
    if (evt.target === cyRef.current) { cancelSource(); setSelectedEdge(null); }
  }, [cancelSource]);

  // ── Cytoscape initialisation ────────────────────────────────────────────────

  const handleCyRef = useCallback((cy: Core) => {
    if (cyRef.current === cy) return;          // already initialised
    cyRef.current = cy;
    initialised.current = false;               // reset so init effect re-runs
    cy.removeAllListeners();                   // prevent duplicate handlers
    cy.on("tap", "node", handleNodeTap);
    cy.on("tap", "edge", handleEdgeTap);
    cy.on("tap",         handleBgTap);

    // Persist positions after every node drag and after layout completes
    cy.on("dragfree", "node", () => savePositions("connections", cy));
    cy.on("layoutstop", () => savePositions("connections", cy));
    setCyReady(true);                          // trigger effects
  }, [handleNodeTap, handleEdgeTap, handleBgTap]);

  // ── Sync nodes on first load ────────────────────────────────────────────────

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !nodes.length || initialised.current) return;

    const cached = getPositions("connections");
    const allCached = cached && nodes.every((n) => cached[n.id]);

    cy.add(nodes.map((n) => ({
      data: buildNodeData(n),
      ...(allCached && cached[n.id] ? { position: cached[n.id] } : {}),
    })));
    cy.add(edges.map((e) => ({ data: buildEdgeData(e, t) })));

    if (!allCached) {
      cy.layout(COSE_LAYOUT).run();
    }
    initialised.current = true;
  }, [nodes, edges, cyReady]);

  // ── Sync edge additions / removals ─────────────────────────────────────────

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !initialised.current) return;
    const existing = new Set(cy.edges().map((e) => e.id()));
    const incoming  = new Set(edges.map((e) => e.id));
    for (const e of edges)   if (!existing.has(e.id)) cy.add({ data: buildEdgeData(e, t) });
    for (const id of existing) if (!incoming.has(id))  cy.getElementById(id).remove();
  }, [edges, cyReady]);

  // ── Apply visibility filter (show/hide) ────────────────────────────────────

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !initialised.current) return;

    if (!visibleNodeIds && !visibleEdgeIds) {
      // No filter — show everything
      cy.elements().style({ display: "element" });
      return;
    }

    cy.batch(() => {
      cy.nodes().forEach((node) => {
        const show = !visibleNodeIds || visibleNodeIds.has(node.id());
        node.style("display", show ? "element" : "none");
      });
      cy.edges().forEach((edge) => {
        const show = !visibleEdgeIds || visibleEdgeIds.has(edge.id());
        edge.style("display", show ? "element" : "none");
      });
    });
  }, [visibleNodeIds, visibleEdgeIds]);

  // ── Keyboard: Escape ────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { cancelSource(); setDialogOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancelSource]);

  // ── Dialog confirm ──────────────────────────────────────────────────────────

  const handleConfirm = async () => {
    const src = pendingSourceRef.current;
    const tgt = dialogTargetRef.current;
    if (!src || !tgt) return;

    // Capture values and close dialog + reset state BEFORE the async call
    const srcId = src.id;
    const tgtId = tgt.id;
    const type  = selectedEdgeType;

    setDialogOpen(false);
    setDialogTarget(null);
    dialogTargetRef.current = null;
    cancelSource();

    await onCreate(srcId, tgtId, type);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setDialogTarget(null);
    dialogTargetRef.current = null;
    cancelSource();
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ position: "relative", height: "calc(100vh - 230px)", minHeight: 480 }}>

      {/* Instruction / status banner */}
      {invalidMsg ? (
        <Alert
          severity="warning"
          icon={<BlockIcon fontSize="small" />}
          sx={{ position: "absolute", top: 8, left: 8, zIndex: 10, py: 0.5, maxWidth: 440 }}
        >
          {t("connections.graph.invalidTarget")}
        </Alert>
      ) : pendingSource ? (
        <Alert
          severity="info"
          sx={{ position: "absolute", top: 8, left: 8, zIndex: 10, py: 0.5, maxWidth: 460 }}
          action={
            <Button size="small" startIcon={<CancelIcon />} onClick={cancelSource} color="inherit">
              {t("common.cancel")}
            </Button>
          }
        >
          <strong>{pendingSource.name}</strong>{" "}{t("connections.graph.clickTarget")}
          {" — "}<em>{t("connections.graph.validTargetsHint")}</em>
        </Alert>
      ) : (
        <Alert
          severity="info"
          icon={false}
          sx={{ position: "absolute", top: 8, left: 8, zIndex: 10, py: 0.5, maxWidth: 400, opacity: 0.85 }}
        >
          {t("connections.graph.hint")}
        </Alert>
      )}

      {/* Canvas */}
      <CytoscapeComponent
        elements={[]}
        stylesheet={cytoscapeStylesheet}
        layout={{ name: "preset" }}
        style={{ width: "100%", height: "100%", cursor: pendingSource ? "crosshair" : "default" }}
        cy={handleCyRef}
      />

      <GraphControls
        cyRef={cyRef}
        graphName="connections"
        positionKey="connections"
        onResetLayout={() => cyRef.current?.layout(COSE_LAYOUT).run()}
      />

      <Box sx={{ position: "absolute", bottom: 16, left: 16, zIndex: 10 }}>
        <LegendPanel />
      </Box>

      {/* Selected edge panel */}
      {selectedEdge && (
        <Card
          variant="outlined"
          sx={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", zIndex: 10, minWidth: 300 }}
        >
          <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Stack direction="row" alignItems="center" spacing={2} justifyContent="space-between">
              <Stack direction="row" spacing={1} alignItems="center">
                <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: EDGE_STYLES[selectedEdge.type]?.color }} />
                <Typography variant="body2" fontWeight={500}>{t(`edgeTypes.${selectedEdge.type}`)}</Typography>
                <Chip label={t("connections.graph.selectedEdge")} size="small" variant="outlined" />
              </Stack>
              <Stack direction="row" spacing={1}>
                <Button
                  size="small" color="error" variant="outlined"
                  startIcon={deleting ? <CircularProgress size={14} color="inherit" /> : <DeleteIcon />}
                  disabled={deleting}
                  onClick={async () => { await onDelete(selectedEdge.id); setSelectedEdge(null); }}
                >
                  {t("connections.graph.deleteEdge")}
                </Button>
                <Button size="small" onClick={() => setSelectedEdge(null)}>{t("common.close")}</Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Edge-type dialog — only valid types shown */}
      <Dialog open={dialogOpen} onClose={handleDialogClose} maxWidth="xs" fullWidth>
        <DialogTitle>{t("connections.graph.dialogTitle")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Chip size="small" label={pendingSource?.name}
                sx={{ bgcolor: NODE_COLORS[pendingSource?.type ?? "Process"], color: "#fff" }} />
              <Typography variant="body2" color="text.secondary">→</Typography>
              <Chip size="small" label={dialogTarget?.name}
                sx={{ bgcolor: NODE_COLORS[dialogTarget?.type ?? "Process"], color: "#fff" }} />
            </Stack>
            <FormControl size="small" fullWidth>
              <InputLabel>{t("connections.createSection.edgeType")}</InputLabel>
              <Select
                label={t("connections.createSection.edgeType")}
                value={selectedEdgeType}
                onChange={(e) => setSelectedEdgeType(e.target.value as EdgeType)}
              >
                {availableEdgeTypes.map((et) => (
                  <MenuItem key={et} value={et}>{t(`edgeTypes.${et}`)}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDialogClose}>{t("common.cancel")}</Button>
          <Button onClick={handleConfirm} variant="contained" disabled={creating}
            startIcon={creating ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {t("connections.createSection.create")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ConnectionGraph;
