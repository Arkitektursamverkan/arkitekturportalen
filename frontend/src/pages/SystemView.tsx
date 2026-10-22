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
import { useSystemView } from "@/api/views";
import CytoscapeGraph, { LAYOUT_OPTIONS } from "@/components/graph/CytoscapeGraph";
import DomainArchitectureTeaser from "@/components/targetArchitecture/DomainArchitectureTeaser";
import GraphControls from "@/components/graph/GraphControls";
import LegendPanel from "@/components/graph/LegendPanel";
import DomainFilterBar, { useDomainFilter } from "@/components/graph/DomainFilter";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ObjectPane, { selectObject } from "@/components/objectContent/ObjectPane";
import ErrorAlert from "@/components/common/ErrorAlert";
import QuickAddNode from "@/components/graph/QuickAddNode";
import { useGraphStore } from "@/store/graphStore";
import { arkflowsForApplication, useArkflows } from "@/api/arkflows";
import SystemProcessesTab from "@/components/flow/SystemProcessesTab";

// Special values for the status filter, alongside the actual status strings.
const STATUS_ALL_EXCEPT_DECOMMISSIONED = "__active__";
const STATUS_ALL = "__all__";
const STATUS_MISSING = "__missing__";

// Same idea for the source filter — which system the application came from.
const SOURCE_ALL = "__all__";

const nodeStatus = (attributes: Record<string, unknown> | undefined): string =>
  typeof attributes?.["status"] === "string" ? (attributes["status"] as string).trim() : "";

const isDecommissioned = (attributes: Record<string, unknown> | undefined): boolean =>
  nodeStatus(attributes).toLowerCase() === "avvecklat";

const SystemView: React.FC = () => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("id") ?? undefined;
  const cyRef = useRef<Core | null>(null);
  const [searchText, setSearchText] = useState("");
  // Default: hide systems marked as decommissioned (status "Avvecklat").
  const [statusFilter, setStatusFilter] = useState(STATUS_ALL_EXCEPT_DECOMMISSIONED);
  // Default: every source — SharePoint-synced and hand-added applications alike.
  const [sourceFilter, setSourceFilter] = useState(SOURCE_ALL);

  const { data: apps, isLoading: loadingList } = useNodes({ node_type: "Application" });
  const { data: edges = [] } = useEdges();
  const { data: graph, isLoading: loadingGraph, error } = useSystemView(selectedId);

  // Systemprocesser published onto this application from Arkitekten. The tab
  // only exists when there is at least one; standing on it and selecting an
  // application without any, ObjectPane falls back to the graph.
  const { data: arkflows } = useArkflows();
  const systemprocesser = useMemo(
    () => arkflowsForApplication(arkflows, selectedId),
    [arkflows, selectedId],
  );
  const viewTabs = [
    { value: "graf", label: t("flowScene.tabGraph") },
    ...(systemprocesser.length > 0
      ? [{ value: "systemprocesser", label: `${t("flowScene.tabSystemProcesses")} (${systemprocesser.length})` }]
      : []),
  ];

  // Domain (node type) filter for the canvas — all domains visible by default.
  const domainFilter = useDomainFilter(graph, selectedId);
  const setAnchorNodeId = useGraphStore((s) => s.setAnchorNodeId);
  const clearSelection = useGraphStore((s) => s.clearSelection);

  // Count only edges visible in System View: outgoing from app + incoming INTEGRATES_WITH
  const SYSTEM_VIEW_TYPES = new Set(["SUPPORTS", "HANDLES", "CONTAINS", "RUNS_ON", "INTEGRATES_WITH"]);
  const edgeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of edges) {
      if (!SYSTEM_VIEW_TYPES.has(e.type)) continue;
      counts[e.source_id] = (counts[e.source_id] ?? 0) + 1;
      if (e.type === "INTEGRATES_WITH") {
        counts[e.target_id] = (counts[e.target_id] ?? 0) + 1;
      }
    }
    return counts;
  }, [edges]);

  const statusOptions = useMemo(() => {
    const values = new Set<string>();
    let hasMissing = false;
    for (const a of apps ?? []) {
      const s = nodeStatus(a.attributes);
      if (s) values.add(s);
      else hasMissing = true;
    }
    return { values: [...values].sort((x, y) => x.localeCompare(y, "sv")), hasMissing };
  }, [apps]);

  const sourceOptions = useMemo(() => {
    const values = new Set<string>();
    for (const a of apps ?? []) {
      if (a.external_source) values.add(a.external_source);
    }
    return [...values].sort((x, y) => x.localeCompare(y, "sv"));
  }, [apps]);

  const visibleApps = useMemo(
    () =>
      (apps ?? [])
        .filter((a) => !searchText || a.name.toLowerCase().includes(searchText.toLowerCase()))
        .filter((a) => {
          if (statusFilter === STATUS_ALL) return true;
          if (statusFilter === STATUS_ALL_EXCEPT_DECOMMISSIONED) return !isDecommissioned(a.attributes);
          if (statusFilter === STATUS_MISSING) return !nodeStatus(a.attributes);
          return nodeStatus(a.attributes) === statusFilter;
        })
        .filter((a) => sourceFilter === SOURCE_ALL || a.external_source === sourceFilter),
    [apps, searchText, statusFilter, sourceFilter],
  );

  return (
    <Box sx={{ display: "flex", height: "calc(100vh - 64px)" }}>
      {/* Left panel */}
      <Box sx={{ width: 260, borderRight: 1, borderColor: "divider", overflow: "auto", bgcolor: "background.paper" }}>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="subtitle2" fontWeight={700}>{t("systemView.selectApplication")}</Typography>
        </Box>
        <ListSearchBox value={searchText} onChange={setSearchText} />
        <Box sx={{ px: 1.5, pb: 1 }}>
          <TextField
            select
            size="small"
            fullWidth
            label="Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <MenuItem value={STATUS_ALL_EXCEPT_DECOMMISSIONED}>Alla utom avvecklade</MenuItem>
            <MenuItem value={STATUS_ALL}>Alla</MenuItem>
            {statusOptions.values.map((s) => (
              <MenuItem key={s} value={s}>{s}</MenuItem>
            ))}
            {statusOptions.hasMissing && <MenuItem value={STATUS_MISSING}>Status saknas</MenuItem>}
          </TextField>
        </Box>
        <Box sx={{ px: 1.5, pb: 1 }}>
          <TextField
            select
            size="small"
            fullWidth
            label="Källa"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            <MenuItem value={SOURCE_ALL}>Alla källor</MenuItem>
            {sourceOptions.map((src) => (
              <MenuItem key={src} value={src}>{t(`externalSource.${src}`, { defaultValue: src })}</MenuItem>
            ))}
          </TextField>
        </Box>
        {loadingList ? (
          <LoadingSpinner height={200} />
        ) : (
          <List dense>
            {visibleApps.map((a) => (
              <ListItemButton
                key={a.id}
                selected={a.id === selectedId}
                onClick={() => { setParams(selectObject(params, a.id)); setAnchorNodeId(a.id); clearSelection(); }}
              >
                <ListItemText
                  primary={
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <Typography variant="body2" noWrap sx={{ flexGrow: 1 }}>{a.name}</Typography>
                      {isDecommissioned(a.attributes) && (
                        <Chip label="Avvecklat" size="small" color="warning" variant="outlined" sx={{ height: 18, fontSize: 10, ml: 0.5 }} />
                      )}
                      {(edgeCounts[a.id] ?? 0) > 0 && (
                        <Chip label={edgeCounts[a.id]} size="small" sx={{ height: 18, fontSize: 10, minWidth: 24, ml: 0.5 }} />
                      )}
                    </Stack>
                  }
                  secondary={
                    a.attributes?.["category"]
                      ? String(a.attributes["category"])
                      : undefined
                  }
                />
              </ListItemButton>
            ))}
            {visibleApps.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 3, textAlign: "center" }}>
                Inga applikationer matchar filtret.
              </Typography>
            )}
          </List>
        )}
      </Box>

      {/* Graph canvas, system processes, documents and notes */}
      <ObjectPane nodeId={selectedId} viewTabs={viewTabs}>
        {(flik) => (
          <>
            {!selectedId && (
              <Box sx={{ height: "100%", overflowY: "auto", p: 2 }}>
                <DomainArchitectureTeaser domainKey="application" />
                <Box display="flex" alignItems="center" justifyContent="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">{t("systemView.noSelection")}</Typography>
                </Box>
              </Box>
            )}
            {selectedId && loadingGraph && <LoadingSpinner />}
            {selectedId && error && <Box p={3}><ErrorAlert error={error as Error} /></Box>}
            {selectedId && flik === "systemprocesser" && <SystemProcessesTab flows={systemprocesser} />}
            {selectedId && graph && !loadingGraph && flik === "graf" && (
              <>
                <CytoscapeGraph data={domainFilter.filteredGraph ?? graph} layout="cose" height="100%" cyRef={cyRef} positionKey={`system-view:${selectedId}`} />
                <GraphControls cyRef={cyRef} graphName="system-view" positionKey={`system-view:${selectedId}`} defaultLayout={LAYOUT_OPTIONS.cose} />
                <DomainFilterBar filter={domainFilter} />
                <Box sx={{ position: "absolute", bottom: 16, left: 16 }}>
                  <LegendPanel />
                </Box>
                <QuickAddNode
                  anchorNodeId={selectedId}
                  anchorNodeType="Application"
                  anchorNodeName={apps?.find((a) => a.id === selectedId)?.name}
                />
              </>
            )}
          </>
        )}
      </ObjectPane>
    </Box>
  );
};

export default SystemView;
