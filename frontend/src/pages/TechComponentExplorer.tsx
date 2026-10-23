import React, { useMemo, useRef, useState } from "react";
import {
  Box, Chip, List, ListItemButton, ListItemText, MenuItem, Stack, TextField, Typography,
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

// Sentinel values for the component-type filter, kept apart from real types.
const TYPE_ALL = "__all__";
const TYPE_MISSING = "__missing__";

const componentType = (attributes: Record<string, unknown> | undefined): string =>
  typeof attributes?.["komponenttyp"] === "string" ? (attributes["komponenttyp"] as string).trim() : "";

const TechComponentExplorer: React.FC = () => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("id") ?? undefined;
  const cyRef = useRef<Core | null>(null);
  const [searchText, setSearchText] = useState("");
  const [typeFilter, setTypeFilter] = useState(TYPE_ALL);
  const clearSelection = useGraphStore((s) => s.clearSelection);

  const { data: allNodes = [], isLoading: loadingList } = useNodes();
  const { data: edges = [] } = useEdges();

  const techComponents = useMemo(
    () => allNodes.filter((n) => n.type === "TechnologyComponent"),
    [allNodes],
  );

  const typeOptions = useMemo(() => {
    const values = new Set<string>();
    let hasMissing = false;
    for (const n of techComponents) {
      const v = componentType(n.attributes);
      if (v) values.add(v);
      else hasMissing = true;
    }
    return { values: [...values].sort((x, y) => x.localeCompare(y, "sv")), hasMissing };
  }, [techComponents]);

  const visibleComponents = useMemo(
    () =>
      techComponents
        .filter((n) => !searchText || n.name.toLowerCase().includes(searchText.toLowerCase()))
        .filter((n) => {
          if (typeFilter === TYPE_ALL) return true;
          if (typeFilter === TYPE_MISSING) return !componentType(n.attributes);
          return componentType(n.attributes) === typeFilter;
        }),
    [techComponents, searchText, typeFilter],
  );

  const edgeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of edges) {
      if (e.type === "RUNS_ON") {
        counts[e.target_id] = (counts[e.target_id] ?? 0) + 1;
        counts[e.source_id] = (counts[e.source_id] ?? 0) + 1;
      }
    }
    return counts;
  }, [edges]);

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
        id: n.id, type: n.type, name: n.name, description: n.description,
        external_source: n.external_source, archived: n.archived, attributes: n.attributes,
      }));
    const graphEdges = matchedEdges.map((e) => ({
      id: e.id, source: e.source_id, target: e.target_id, type: e.type, attributes: e.attributes,
    }));
    return { nodes: graphNodes, edges: graphEdges };
  }, [selectedId, allNodes, edges]);

  // Domain (node type) filter for the canvas — all domains visible by default.
  const domainFilter = useDomainFilter(graph, selectedId);

  return (
    <Box sx={{ display: "flex", height: "calc(100vh - 64px)" }}>
      <Box sx={{ width: 280, borderRight: 1, borderColor: "divider", overflow: "auto", bgcolor: "background.paper" }}>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{t("techComponentExplorer.select")}</Typography>
        </Box>
        <ListSearchBox value={searchText} onChange={setSearchText} />
        <Box sx={{ px: 1.5, pb: 1 }}>
          <TextField
            select
            size="small"
            fullWidth
            label="Komponenttyp"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <MenuItem value={TYPE_ALL}>Alla komponenttyper</MenuItem>
            {typeOptions.values.map((v) => (
              <MenuItem key={v} value={v}>{v}</MenuItem>
            ))}
            {typeOptions.hasMissing && <MenuItem value={TYPE_MISSING}>Komponenttyp saknas</MenuItem>}
          </TextField>
        </Box>
        {loadingList ? (
          <LoadingSpinner height={200} />
        ) : (
          <List dense>
            {visibleComponents.map((n) => (
              <ListItemButton key={n.id} selected={n.id === selectedId} onClick={() => { setParams(selectObject(params, n.id)); clearSelection(); }}>
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
                  secondary={<Chip label={t(`externalSource.${n.external_source}`)} size="small" sx={{ height: 16, fontSize: 10 }} />}
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>

      <ObjectPane nodeId={selectedId} viewTabs={[{ value: "graf", label: t("flowScene.tabGraph") }]}>
        {() => (
          <>
            {!selectedId && (
              <Box sx={{ height: "100%", overflowY: "auto", p: 2 }}>
                <DomainArchitectureTeaser domainKey="technology" />
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 4 }}>
                  <Typography sx={{ color: "text.secondary" }}>{t("techComponentExplorer.noSelection")}</Typography>
                </Box>
              </Box>
            )}
            {selectedId && graph && (
              <>
                <CytoscapeGraph data={domainFilter.filteredGraph ?? graph} layout="cose" height="100%" cyRef={cyRef} positionKey={`tech-comp:${selectedId}`} />
                <GraphControls cyRef={cyRef} graphName="tech-comp" positionKey={`tech-comp:${selectedId}`} defaultLayout={LAYOUT_OPTIONS.cose} />
                <DomainFilterBar filter={domainFilter} />
                <Box sx={{ position: "absolute", bottom: 16, left: 16 }}>
                  <LegendPanel />
                </Box>
                <QuickAddNode
                  anchorNodeId={selectedId}
                  anchorNodeType="TechnologyComponent"
                  anchorNodeName={techComponents.find((n) => n.id === selectedId)?.name}
                />
              </>
            )}
          </>
        )}
      </ObjectPane>
    </Box>
  );
};

export default TechComponentExplorer;
