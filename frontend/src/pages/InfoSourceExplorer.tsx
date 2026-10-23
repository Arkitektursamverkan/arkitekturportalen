import React, { useMemo, useRef, useState } from "react";
import {
  Box, Chip, List, ListItemButton, ListItemText, Stack, Typography,
} from "@mui/material";
import ListSearchBox from "@/components/common/ListSearchBox";
import type { Core } from "cytoscape";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useNodes } from "@/api/nodes";
import { useEdges } from "@/api/edges";
import CytoscapeGraph, { LAYOUT_OPTIONS } from "@/components/graph/CytoscapeGraph";
import GraphControls from "@/components/graph/GraphControls";
import LegendPanel from "@/components/graph/LegendPanel";
import DomainFilterBar, { useDomainFilter } from "@/components/graph/DomainFilter";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ObjectPane, { selectObject } from "@/components/objectContent/ObjectPane";
import QuickAddNode from "@/components/graph/QuickAddNode";
import DomainArchitectureTeaser from "@/components/targetArchitecture/DomainArchitectureTeaser";
import { useGraphStore } from "@/store/graphStore";
import type { GraphData } from "@/types/graph";

const InfoSourceExplorer: React.FC = () => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("id") ?? undefined;
  const cyRef = useRef<Core | null>(null);
  const [searchText, setSearchText] = useState("");
  const clearSelection = useGraphStore((s) => s.clearSelection);

  const { data: allNodes = [], isLoading: loadingList } = useNodes();
  const { data: edges = [] } = useEdges();

  const infoSources = useMemo(
    () => allNodes.filter((n) => n.type === "InformationSource"),
    [allNodes],
  );

  // Count edges connected to each info source
  const edgeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of edges) {
      if (e.type === "REALIZES" || e.type === "CONTAINS" || e.type === "USES") {
        counts[e.target_id] = (counts[e.target_id] ?? 0) + 1;
        counts[e.source_id] = (counts[e.source_id] ?? 0) + 1;
      }
    }
    return counts;
  }, [edges]);

  // Build subgraph for selected info source: follow all edges one hop out
  const graph = useMemo<GraphData | undefined>(() => {
    if (!selectedId) return undefined;
    const nodeIds = new Set<string>([selectedId]);
    const matchedEdges = edges.filter((e) => {
      if (e.source_id === selectedId || e.target_id === selectedId) {
        nodeIds.add(e.source_id);
        nodeIds.add(e.target_id);
        return true;
      }
      return false;
    });
    const graphNodes = allNodes
      .filter((n) => nodeIds.has(n.id))
      .map((n) => ({
        id: n.id,
        type: n.type,
        name: n.name,
        description: n.description,
        external_source: n.external_source,
        archived: n.archived,
        attributes: n.attributes,
      }));
    const graphEdges = matchedEdges.map((e) => ({
      id: e.id,
      source: e.source_id,
      target: e.target_id,
      type: e.type,
      attributes: e.attributes,
    }));
    return { nodes: graphNodes, edges: graphEdges };
  }, [selectedId, allNodes, edges]);

  // Domain (node type) filter for the canvas — all domains visible by default.
  const domainFilter = useDomainFilter(graph, selectedId);

  return (
    <Box sx={{ display: "flex", height: "calc(100vh - 64px)" }}>
      {/* Left panel */}
      <Box sx={{ width: 280, borderRight: 1, borderColor: "divider", overflow: "auto", bgcolor: "background.paper" }}>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{t("infoSourceExplorer.select")}</Typography>
        </Box>
        <ListSearchBox value={searchText} onChange={setSearchText} />
        {loadingList ? (
          <LoadingSpinner height={200} />
        ) : (
          <List dense>
            {infoSources.filter((n) => !searchText || n.name.toLowerCase().includes(searchText.toLowerCase())).map((n) => (
              <ListItemButton
                key={n.id}
                selected={n.id === selectedId}
                onClick={() => { setParams(selectObject(params, n.id)); clearSelection(); }}
              >
                <ListItemText
                  primary={
                    <Stack
                      direction="row"
                      sx={{ alignItems: "center", justifyContent: "space-between" }}>
                      <Typography variant="body2" noWrap sx={{ flexGrow: 1 }}>{n.name}</Typography>
                      {(edgeCounts[n.id] ?? 0) > 0 && (
                        <Chip label={edgeCounts[n.id]} size="small" sx={{ height: 18, fontSize: 10, minWidth: 24, ml: 0.5 }} />
                      )}
                    </Stack>
                  }
                  secondary={
                    <Chip label={t(`externalSource.${n.external_source}`)} size="small" sx={{ height: 16, fontSize: 10 }} />
                  }
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>

      {/* Graph canvas, documents and notes */}
      <ObjectPane nodeId={selectedId} viewTabs={[{ value: "graf", label: t("flowScene.tabGraph") }]}>
        {() => (
          <>
            {!selectedId && (
              <Box sx={{ height: "100%", overflowY: "auto", p: 2 }}>
                <DomainArchitectureTeaser domainKey="data" />
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 4 }}>
                  <Typography sx={{ color: "text.secondary" }}>{t("infoSourceExplorer.noSelection")}</Typography>
                </Box>
              </Box>
            )}
            {selectedId && graph && (
              <>
                <CytoscapeGraph data={domainFilter.filteredGraph ?? graph} layout="cose" height="100%" cyRef={cyRef} positionKey={`info-source:${selectedId}`} />
                <GraphControls cyRef={cyRef} graphName="info-source" positionKey={`info-source:${selectedId}`} defaultLayout={LAYOUT_OPTIONS.cose} />
                <DomainFilterBar filter={domainFilter} />
                <Box sx={{ position: "absolute", bottom: 16, left: 16 }}>
                  <LegendPanel />
                </Box>
                <QuickAddNode
                  anchorNodeId={selectedId}
                  anchorNodeType="InformationSource"
                  anchorNodeName={infoSources.find((n) => n.id === selectedId)?.name}
                />
              </>
            )}
          </>
        )}
      </ObjectPane>
    </Box>
  );
};

export default InfoSourceExplorer;
