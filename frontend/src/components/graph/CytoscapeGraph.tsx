import React, { useRef, useCallback } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import cytoscape from "cytoscape";
import type { Core, ElementDefinition } from "cytoscape";
import { Box, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { GraphData, GraphNode, GraphEdge } from "@/types/graph";
import {
  NODE_COLORS,
  NODE_BORDER_COLORS,
  NODE_SHAPES,
  EDGE_STYLES,
  getEdgeArrows,
  cytoscapeStylesheet,
} from "@/config/graphConfig";
import { useGraphStore } from "@/store/graphStore";
import { savePositions, getPositions } from "./positionCache";

interface Props {
  data: GraphData;
  onNodeClick?: (node: GraphNode) => void;
  layout?: "cose" | "breadthfirst" | "circle" | "grid";
  height?: string | number;
  cyRef?: React.MutableRefObject<Core | null>;
  positionKey?: string;
}

export const LAYOUT_OPTIONS: Record<string, cytoscape.LayoutOptions> = {
  cose: { name: "cose", animate: false, randomize: true, nodeRepulsion: () => 400000, padding: 40 } as cytoscape.LayoutOptions,
  breadthfirst: { name: "breadthfirst", directed: true, padding: 40 } as cytoscape.LayoutOptions,
  circle: { name: "circle", padding: 40 } as cytoscape.LayoutOptions,
  grid: { name: "grid", padding: 40 } as cytoscape.LayoutOptions,
};

function buildElements(data: GraphData, translate: (key: string) => string): ElementDefinition[] {
  const nodeIds = new Set(data.nodes.map((n) => n.id));

  const nodeEls: ElementDefinition[] = data.nodes.map((n) => ({
    data: {
      id: n.id,
      label: n.name,
      type: n.type,
      bgColor: NODE_COLORS[n.type] ?? "#999",
      borderColor: NODE_BORDER_COLORS[n.type] ?? "#666",
      shape: NODE_SHAPES[n.type] ?? "ellipse",
      nodeData: n,
    },
  }));

  const edgeEls: ElementDefinition[] = data.edges
    .filter((e) => e.source && e.target && nodeIds.has(e.source) && nodeIds.has(e.target))
    .map((e) => {
      const style = EDGE_STYLES[e.type] ?? EDGE_STYLES.USES;
      const arrows = getEdgeArrows(e.type, e.attributes);
      return {
        data: {
          id: e.id,
          source: e.source,
          target: e.target,
          label: translate(`edgeTypes.${e.type}`),
          color: style.color,
          lineStyle: style.lineStyle,
          width: style.width,
          sourceArrow: arrows.sourceArrow,
          targetArrow: arrows.targetArrow,
          edgeData: e,
        },
      };
    });

  return [...nodeEls, ...edgeEls];
}

const CytoscapeGraph: React.FC<Props> = ({
  data,
  onNodeClick,
  layout = "cose",
  height = "100%",
  cyRef: externalCyRef,
  positionKey,
}) => {
  const { t } = useTranslation();
  const selectNodeRef = useRef(useGraphStore.getState().selectNode);
  const selectEdgeRef = useRef(useGraphStore.getState().selectEdge);
  selectNodeRef.current = useGraphStore.getState().selectNode;
  selectEdgeRef.current = useGraphStore.getState().selectEdge;
  const onNodeClickRef = useRef(onNodeClick);
  onNodeClickRef.current = onNodeClick;
  const positionKeyRef = useRef(positionKey);
  positionKeyRef.current = positionKey;
  const prevCyRef = useRef<Core | null>(null);

  // Stable callback — react-cytoscapejs calls this AFTER elements are added
  // and the layout has already run. So we can immediately restore positions.
  const handleCy = useCallback((cy: Core) => {
    if (externalCyRef) externalCyRef.current = cy;

    // Skip if same cy instance (called on every render via componentDidUpdate)
    if (prevCyRef.current === cy) return;
    prevCyRef.current = cy;

    // ── Restore saved positions immediately ──────────────────────────────
    // react-cytoscapejs calls cy() AFTER layout has run, so we override now.
    const key = positionKeyRef.current;
    if (key) {
      const cached = getPositions(key);
      // Only restore if we have a position for EVERY node (avoids partial/stale cache)
      const nodes = cy.nodes();
      let allMatch = !!cached && nodes.length > 0;
      if (allMatch) {
        nodes.forEach((node) => {
          if (!cached![node.id()]) allMatch = false;
        });
      }
      if (allMatch) {
        nodes.forEach((node) => { node.position(cached![node.id()]); });
        cy.fit(undefined, 40);
      }
      // Save current positions (either restored or from fresh layout)
      savePositions(key, cy);
    }

    // ── Event handlers ───────────────────────────────────────────────────
    cy.on("tap", "node", (evt) => {
      const nd: GraphNode = evt.target.data("nodeData");
      if (nd) {
        selectNodeRef.current(nd);
        onNodeClickRef.current?.(nd);
      }
    });

    cy.on("tap", "edge", (evt) => {
      const ed: GraphEdge = evt.target.data("edgeData");
      if (ed) selectEdgeRef.current(ed);
    });

    cy.on("tap", (evt) => {
      if (evt.target === cy) {
        selectNodeRef.current(null);
        selectEdgeRef.current(null);
      }
    });

    // Save positions after every drag
    cy.on("dragfree", "node", () => {
      const k = positionKeyRef.current;
      if (k) savePositions(k, cy);
    });

    // Save positions after layout resets (reset button triggers this)
    cy.on("layoutstop", () => {
      const k = positionKeyRef.current;
      if (k) savePositions(k, cy);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data.nodes.length) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: height, color: "text.secondary" }}>
        <Typography variant="body1">{t("graph.noData")}</Typography>
      </Box>
    );
  }

  const elements = buildElements(data, t);
  const layoutOpts = LAYOUT_OPTIONS[layout] ?? LAYOUT_OPTIONS.cose;
  // Include element count in key so graph remounts when nodes/edges are added/removed
  const dataKey = `${positionKey ?? "default"}-${data.nodes.length}-${data.edges.length}`;

  return (
    <CytoscapeComponent
      key={dataKey}
      elements={elements}
      stylesheet={cytoscapeStylesheet}
      layout={layoutOpts}
      style={{ width: "100%", height }}
      cy={handleCy}
    />
  );
};

export default CytoscapeGraph;
