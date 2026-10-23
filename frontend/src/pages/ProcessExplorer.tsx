import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box, Chip, Collapse, IconButton, List, ListItemButton, ListItemIcon,
  ListItemText, Stack, Tooltip, Typography,
} from "@mui/material";
import ListSearchBox from "@/components/common/ListSearchBox";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import type { Core } from "cytoscape";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useNodes, useUpdateNode } from "@/api/nodes";
import { useEdges } from "@/api/edges";
import { useProcessE2E } from "@/api/views";
import { useRoleStore } from "@/store/roleStore";
import CytoscapeGraph, { LAYOUT_OPTIONS } from "@/components/graph/CytoscapeGraph";
import GraphControls from "@/components/graph/GraphControls";
import LegendPanel from "@/components/graph/LegendPanel";
import DomainFilterBar, { useDomainFilter } from "@/components/graph/DomainFilter";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ErrorAlert from "@/components/common/ErrorAlert";
import QuickAddNode from "@/components/graph/QuickAddNode";
import DomainArchitectureTeaser from "@/components/targetArchitecture/DomainArchitectureTeaser";
import FlowSceneView from "@/components/flow/FlowSceneView";
import ObjectPane, { selectObject } from "@/components/objectContent/ObjectPane";
import { arkflowForProcess, useArkflowForProcess } from "@/api/arkflows";
import { useGraphStore } from "@/store/graphStore";
import type { NodeRead } from "@/types/graph";
import { isPublishedProcess } from "@/utils/processStructure";

// ── Tree helpers ──────────────────────────────────────────────────────────────

interface ProcessTreeNode {
  process: NodeRead;
  children: ProcessTreeNode[];
  supportCount: number;
}

/**
 * Order sibling processes naturally by their numeric `prefix` attribute
 * (e.g. "1.1.10" sorts after "1.1.2", not between "1.1.1" and "1.1.2").
 * Processes without a prefix fall to the end, ordered by name.
 */
function compareProcesses(a: ProcessTreeNode, b: ProcessTreeNode): number {
  const pa = (a.process.attributes?.prefix as string | undefined) ?? "";
  const pb = (b.process.attributes?.prefix as string | undefined) ?? "";
  if (pa && !pb) return -1;
  if (!pa && pb) return 1;
  if (pa && pb) {
    const sa = pa.split(".");
    const sb = pb.split(".");
    for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
      const va = sa[i];
      const vb = sb[i];
      if (va === undefined) return -1;
      if (vb === undefined) return 1;
      const na = Number(va);
      const nb = Number(vb);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) {
        if (na !== nb) return na - nb;
      } else {
        const cmp = va.localeCompare(vb);
        if (cmp !== 0) return cmp;
      }
    }
  }
  return a.process.name.localeCompare(b.process.name);
}

function buildTree(
  processes: NodeRead[],
  edgeCounts: Record<string, number>,
): ProcessTreeNode[] {
  const byId = new Map(processes.map((p) => [p.id, p]));
  const childrenMap = new Map<string | null, ProcessTreeNode[]>();

  for (const p of processes) {
    const parentId = (p.attributes?.parent_id as string) || null;
    // Only treat as child if the parent actually exists
    const effectiveParent = parentId && byId.has(parentId) ? parentId : null;
    const node: ProcessTreeNode = {
      process: p,
      children: [],
      supportCount: edgeCounts[p.id] ?? 0,
    };
    const siblings = childrenMap.get(effectiveParent) ?? [];
    siblings.push(node);
    childrenMap.set(effectiveParent, siblings);
  }

  // Recursively attach children
  function attach(parentId: string | null): ProcessTreeNode[] {
    const nodes = childrenMap.get(parentId) ?? [];
    for (const node of nodes) {
      node.children = attach(node.process.id);
      node.children.sort(compareProcesses);
    }
    return nodes;
  }

  const roots = attach(null);
  roots.sort(compareProcesses);
  return roots;
}

// ── Tree item component ──────────────────────────────────────────────────────

interface TreeItemProps {
  node: ProcessTreeNode;
  depth: number;
  selectedId: string | undefined;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  onSelect: (id: string) => void;
  onToggleHidden?: (id: string, nextHidden: boolean) => void;
  onToggleStructure?: (id: string, nextStructure: boolean) => void;
  isAdmin: boolean;
  /** Har processen ett flödesschema? Markeras i trädet. */
  harFlödesschema: (process: { id: string; attributes?: Record<string, unknown> }) => boolean;
  t: (k: string) => string;
}

/** 2C8's workflow states for a model that is not (or no longer) approved. */
const WORKFLOW_STATE_LABELS: Record<string, string> = {
  EDITABLE: "redigeras",
  UNDER_APPROVAL: "väntar på godkännande",
  UNDER_REVISION: "revideras",
};

const TreeItem: React.FC<TreeItemProps> = ({
  node, depth, selectedId, expanded, toggleExpand, onSelect, onToggleHidden, onToggleStructure, isAdmin, harFlödesschema, t,
}) => {
  const harFlöde = harFlödesschema(node.process);
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.process.id);
  const isHidden = !!node.process.admin_hidden;
  const isStructure = !!node.process.is_structure;

  return (
    <>
      <ListItemButton
        selected={node.process.id === selectedId}
        onClick={() => onSelect(node.process.id)}
        sx={{ pl: 1.5 + depth * 2, opacity: isHidden ? 0.55 : 1 }}
      >
        {hasChildren ? (
          <ListItemIcon sx={{ minWidth: 28 }}>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node.process.id);
              }}
              sx={{ p: 0 }}
            >
              {isExpanded ? (
                <ExpandMoreIcon fontSize="small" />
              ) : (
                <ChevronRightIcon fontSize="small" />
              )}
            </IconButton>
          </ListItemIcon>
        ) : (
          <ListItemIcon sx={{ minWidth: 28 }} />
        )}
        <ListItemText
          primary={
            <Stack
              direction="row"
              sx={{ alignItems: "center", justifyContent: "space-between" }}>
              <Typography variant="body2" noWrap sx={{ flexGrow: 1 }}>
                {node.process.name}
              </Typography>
              {harFlöde && (
                <Tooltip title={t("flowScene.tabFlow")}>
                  <AccountTreeIcon
                    sx={{ fontSize: 14, color: "primary.main", ml: 0.5, flexShrink: 0 }}
                  />
                </Tooltip>
              )}
              {node.supportCount > 0 && (
                <Chip
                  label={node.supportCount}
                  size="small"
                  sx={{ height: 18, fontSize: 10, minWidth: 24, ml: 0.5 }}
                />
              )}
            </Stack>
          }
          secondary={
            <Stack direction="row" spacing={0.5}>
              <Chip
                label={t(`externalSource.${node.process.external_source}`)}
                size="small"
                sx={{ height: 16, fontSize: 10 }}
              />
              {isStructure && (
                <Chip
                  label="Struktur"
                  size="small"
                  variant="outlined"
                  sx={{ height: 16, fontSize: 10 }}
                />
              )}
              {!isPublishedProcess(node.process) && (
                <Tooltip
                  title={`Nuvarande version är inte godkänd i 2C8 (${
                    WORKFLOW_STATE_LABELS[node.process.attributes?.workflow_state as string] ??
                    node.process.attributes?.workflow_state
                  }). Räknas inte i statistik och rapporter.`}
                >
                  <Chip
                    label="Ej godkänd"
                    size="small"
                    variant="outlined"
                    color="warning"
                    sx={{ height: 16, fontSize: 10 }}
                  />
                </Tooltip>
              )}
            </Stack>
          }
        />
        {isAdmin && onToggleStructure && (
          <Tooltip
            title={isStructure ? "Markera som process" : "Markera som struktur (rubrik, ingen egen process)"}
            placement="left"
          >
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onToggleStructure(node.process.id, !isStructure);
              }}
              sx={{
                ml: 0.5,
                p: 0.25,
                opacity: isStructure ? 1 : 0.45,
                "&:hover": { opacity: 1 },
                color: isStructure ? "info.main" : "inherit",
              }}
            >
              <AccountTreeIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {isAdmin && onToggleHidden && (
          <Tooltip
            title={isHidden ? "Visa processen för användare" : "Dölj processen för användare"}
            placement="left"
          >
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onToggleHidden(node.process.id, !isHidden);
              }}
              sx={{
                ml: 0.5,
                p: 0.25,
                opacity: isHidden ? 1 : 0.45,
                "&:hover": { opacity: 1 },
                color: isHidden ? "warning.main" : "inherit",
              }}
            >
              {isHidden ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        )}
      </ListItemButton>
      {hasChildren && (
        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
          <List dense disablePadding>
            {node.children.map((child) => (
              <TreeItem
                key={child.process.id}
                node={child}
                depth={depth + 1}
                selectedId={selectedId}
                expanded={expanded}
                toggleExpand={toggleExpand}
                onSelect={onSelect}
                onToggleHidden={onToggleHidden}
                onToggleStructure={onToggleStructure}
                isAdmin={isAdmin}
                harFlödesschema={harFlödesschema}
                t={t}
              />
            ))}
          </List>
        </Collapse>
      )}
    </>
  );
};

// ── Main component ───────────────────────────────────────────────────────────

const ProcessExplorer: React.FC = () => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("id") ?? undefined;
  const cyRef = useRef<Core | null>(null);
  const { isEditor: isAdmin } = useRoleStore();

  const { data: rawProcesses, isLoading: loadingList } = useNodes({ node_type: "Process" });
  const { data: edges = [] } = useEdges();
  const { data: graph, isLoading: loadingGraph, error } = useProcessE2E(selectedId);

  // Domain (node type) filter for the canvas — all domains visible by default.
  const domainFilter = useDomainFilter(graph, selectedId);

  const updateNode = useUpdateNode();

  // Non-admins never see admin-hidden processes. Admins see them all (dimmed
  // + with the eye icon) so they can toggle visibility back on.
  const processes = useMemo(() => {
    if (!rawProcesses) return undefined;
    if (isAdmin) return rawProcesses;
    return rawProcesses.filter((p) => !p.admin_hidden);
  }, [rawProcesses, isAdmin]);

  // Flödesschemat för den valda processen. Ett flöde publicerat ur
  // Arkitekten pekar ut sin nod; äldre speglingar kopplas på 2C8-numreringen
  // i attributes.prefix, som 2C8-synken skriver på noderna.
  const valdProcess = processes?.find((p) => p.id === selectedId);
  const valtPrefix = (valdProcess?.attributes?.prefix as string | undefined) ?? null;
  const flöde = useArkflowForProcess(selectedId, valtPrefix);
  // Vilka processer som HAR ett flödesschema – för markören i trädet. Samma
  // regel som fliken, så att markören aldrig lovar något fliken inte visar.
  const harFlödesschema = useCallback(
    (p: { id: string; attributes?: Record<string, unknown> }) =>
      Boolean(arkflowForProcess(flöde.alla, p.id, (p.attributes?.prefix as string | undefined) ?? null)),
    [flöde.alla],
  );
  // Flödesfliken finns bara när processen har ett flödesschema; står man på
  // den och väljer en process utan, faller ObjectPane tillbaka på grafen.
  const viewTabs = [
    { value: "graf", label: t("flowScene.tabGraph") },
    ...(flöde.missing ? [] : [{ value: "flode", label: t("flowScene.tabFlow") }]),
  ];

  const onToggleHidden = (id: string, nextHidden: boolean) => {
    updateNode.mutate({ id, admin_hidden: nextHidden });
  };

  const onToggleStructure = (id: string, nextStructure: boolean) => {
    updateNode.mutate({ id, is_structure: nextStructure });
  };

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [searchText, setSearchText] = useState("");

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Count only SUPPORTS edges targeting each process (apps that support it)
  const edgeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of edges) {
      if (e.type === "SUPPORTS") {
        counts[e.target_id] = (counts[e.target_id] ?? 0) + 1;
      }
    }
    return counts;
  }, [edges]);

  const tree = useMemo(
    () => buildTree(processes ?? [], edgeCounts),
    [processes, edgeCounts],
  );

  // Auto-expand ancestors when selectedId comes from URL (e.g. navigating from another page)
  useEffect(() => {
    if (!selectedId || !processes) return;
    const byId = new Map(processes.map((p) => [p.id, p]));
    const toExpand = new Set<string>();
    let current = byId.get(selectedId);
    while (current) {
      const parentId = current.attributes?.parent_id as string | undefined;
      if (parentId && byId.has(parentId)) {
        toExpand.add(parentId);
        current = byId.get(parentId);
      } else {
        break;
      }
    }
    if (toExpand.size > 0) {
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const id of toExpand) next.add(id);
        return next;
      });
    }
  }, [selectedId, processes]);

  const setAnchorNodeId = useGraphStore((s) => s.setAnchorNodeId);
  const clearSelection = useGraphStore((s) => s.clearSelection);

  // When selecting a process, auto-expand its ancestors so it's visible
  const selectProcess = (id: string) => {
    setParams(selectObject(params, id));
    setAnchorNodeId(id);
    clearSelection();
    // Expand ancestors
    if (processes) {
      const byId = new Map(processes.map((p) => [p.id, p]));
      const toExpand = new Set(expanded);
      let current = byId.get(id);
      while (current) {
        const parentId = current.attributes?.parent_id as string | undefined;
        if (parentId && byId.has(parentId)) {
          toExpand.add(parentId);
          current = byId.get(parentId);
        } else {
          break;
        }
      }
      setExpanded(toExpand);
    }
  };

  return (
    <Box sx={{ display: "flex", height: "calc(100vh - 64px)" }}>
      {/* Left panel — process tree */}
      <Box sx={{ width: 280, borderRight: 1, borderColor: "divider", overflow: "auto", bgcolor: "background.paper" }}>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{t("processExplorer.selectProcess")}</Typography>
        </Box>
        <ListSearchBox value={searchText} onChange={setSearchText} />
        {loadingList ? (
          <LoadingSpinner height={200} />
        ) : searchText ? (
          <List dense>
            {(processes ?? [])
              .filter((p) => p.name.toLowerCase().includes(searchText.toLowerCase()))
              .map((p) => (
                <ListItemButton key={p.id} selected={p.id === selectedId} onClick={() => selectProcess(p.id)}>
                  <ListItemText primary={<Typography variant="body2" noWrap>{p.name}</Typography>} />
                </ListItemButton>
              ))}
          </List>
        ) : (
          <List dense>
            {tree.map((node) => (
              <TreeItem
                key={node.process.id}
                node={node}
                depth={0}
                selectedId={selectedId}
                expanded={expanded}
                toggleExpand={toggleExpand}
                onSelect={selectProcess}
                onToggleHidden={isAdmin ? onToggleHidden : undefined}
                onToggleStructure={isAdmin ? onToggleStructure : undefined}
                isAdmin={isAdmin}
                harFlödesschema={harFlödesschema}
                t={t}
              />
            ))}
          </List>
        )
        }
      </Box>

      {/* Graph canvas, flow, documents and notes */}
      <ObjectPane nodeId={selectedId} viewTabs={viewTabs}>
        {(flik) => (
          <>
            {!selectedId && (
              <Box sx={{ height: "100%", overflowY: "auto", p: 2 }}>
                <DomainArchitectureTeaser domainKey="business" />
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 4 }}>
                  <Typography sx={{ color: "text.secondary" }}>{t("processExplorer.noSelection")}</Typography>
                </Box>
              </Box>
            )}
            {selectedId && loadingGraph && <LoadingSpinner />}
            {selectedId && error && (
              <Box sx={{ p: 3 }}><ErrorAlert error={error as Error} /></Box>
            )}
            {selectedId && graph && !loadingGraph && flik === "flode" && flöde.flow?.scen && (
              <FlowSceneView
                scen={flöde.flow.scen}
                caption={`${flöde.flow.name}${flöde.flow.beteckning ? ` · ${t("flowScene.version")} ${flöde.flow.beteckning}` : ""}${flöde.flow.status ? ` (${flöde.flow.status})` : ""}${flöde.flow.ägare ? ` · ${t("flowScene.owner")}: ${flöde.flow.ägare}` : ""}`}
                beskrivning={flöde.flow.beskrivning ?? undefined}
              />
            )}
            {selectedId && graph && !loadingGraph && flik === "flode" && !flöde.flow?.scen && (
              <Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Typography sx={{ color: "text.secondary" }}>
                  {flöde.isLoading ? t("flowScene.loading") : t("flowScene.none")}
                </Typography>
              </Box>
            )}
            {selectedId && graph && !loadingGraph && flik === "graf" && (
              <>
                <CytoscapeGraph data={domainFilter.filteredGraph ?? graph} layout="breadthfirst" height="100%" cyRef={cyRef} positionKey={`process-e2e:${selectedId}`} />
                <GraphControls cyRef={cyRef} graphName="process-e2e" positionKey={`process-e2e:${selectedId}`} defaultLayout={LAYOUT_OPTIONS.breadthfirst} />
                <DomainFilterBar filter={domainFilter} />
                <Box sx={{ position: "absolute", bottom: 16, left: 16 }}>
                  <LegendPanel />
                </Box>
                <QuickAddNode
                  anchorNodeId={selectedId}
                  anchorNodeType="Process"
                  anchorNodeName={processes?.find((p) => p.id === selectedId)?.name}
                  allowedEdgeTypes={["SUPPORTS", "HANDLES", "REALIZES", "RUNS_ON"]}
                />
              </>
            )}
          </>
        )}
      </ObjectPane>
    </Box>
  );
};

export default ProcessExplorer;
