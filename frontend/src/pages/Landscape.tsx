import React, { useMemo, useRef, useState } from "react";
import {
  Autocomplete,
  Box,
  Checkbox,
  Chip,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import type { Core } from "cytoscape";
import { useTranslation } from "react-i18next";
import { useLandscape } from "@/api/views";
import CytoscapeGraph, { LAYOUT_OPTIONS } from "@/components/graph/CytoscapeGraph";
import GraphControls from "@/components/graph/GraphControls";
import LegendPanel from "@/components/graph/LegendPanel";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ErrorAlert from "@/components/common/ErrorAlert";
import type { GraphData } from "@/types/graph";

const icon = <CheckBoxOutlineBlankIcon fontSize="small" />;
const checkedIcon = <CheckBoxIcon fontSize="small" />;

function getAttr(attrs: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = attrs[k];
    if (v != null && v !== "") return String(v).trim();
  }
  return "";
}

const Landscape: React.FC = () => {
  const { t } = useTranslation();
  const cyRef = useRef<Core | null>(null);
  const { data: graph, isLoading, error, refetch } = useLandscape();

  const [selKategori, setSelKategori] = useState<string[]>([]);
  const [selStatus, setSelStatus] = useState<string[]>([]);
  const [selDriftform, setSelDriftform] = useState<string[]>([]);
  const [selAvdelning, setSelAvdelning] = useState<string[]>([]);
  const [selSystem, setSelSystem] = useState<string[]>([]);

  // Collect unique filter values
  const filterOptions = useMemo(() => {
    if (!graph) return { kategori: [], status: [], driftform: [], avdelning: [], system: [] };
    const sets = { kategori: new Set<string>(), status: new Set<string>(), driftform: new Set<string>(), avdelning: new Set<string>() };
    for (const n of graph.nodes) {
      const a = n.attributes;
      const cat = getAttr(a, "kategori", "category"); if (cat) sets.kategori.add(cat);
      const st = getAttr(a, "status"); if (st) sets.status.add(st);
      const df = getAttr(a, "driftform"); if (df) sets.driftform.add(df);
      const av = getAttr(a, "avdelning", "avdelning/enhet"); if (av) sets.avdelning.add(av);
    }
    return {
      kategori: Array.from(sets.kategori).sort(),
      status: Array.from(sets.status).sort(),
      driftform: Array.from(sets.driftform).sort(),
      avdelning: Array.from(sets.avdelning).sort(),
      system: Array.from(new Set(graph.nodes.map((n) => n.name))).sort((a, b) => a.localeCompare(b)),
    };
  }, [graph]);

  // Filter graph
  const filteredGraph = useMemo<GraphData | undefined>(() => {
    if (!graph) return undefined;
    const noFilters = selKategori.length === 0 && selStatus.length === 0 && selDriftform.length === 0 && selAvdelning.length === 0 && selSystem.length === 0;
    if (noFilters) return graph;

    // Selecting systems shows those systems plus whatever they directly
    // connect to, so you can inspect one or a few systems' integration
    // footprint instead of just hiding everything else outright.
    let systemNeighborhood: Set<string> | null = null;
    if (selSystem.length > 0) {
      const selectedIds = new Set(graph.nodes.filter((n) => selSystem.includes(n.name)).map((n) => n.id));
      systemNeighborhood = new Set(selectedIds);
      for (const e of graph.edges) {
        if (selectedIds.has(e.source)) systemNeighborhood.add(e.target);
        if (selectedIds.has(e.target)) systemNeighborhood.add(e.source);
      }
    }

    const matchingNodes = graph.nodes.filter((n) => {
      const a = n.attributes;
      if (selKategori.length > 0 && !selKategori.includes(getAttr(a, "kategori", "category"))) return false;
      if (selStatus.length > 0 && !selStatus.includes(getAttr(a, "status"))) return false;
      if (selDriftform.length > 0 && !selDriftform.includes(getAttr(a, "driftform"))) return false;
      if (selAvdelning.length > 0 && !selAvdelning.includes(getAttr(a, "avdelning", "avdelning/enhet"))) return false;
      if (systemNeighborhood && !systemNeighborhood.has(n.id)) return false;
      return true;
    });
    const nodeIds = new Set(matchingNodes.map((n) => n.id));
    const matchingEdges = graph.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
    return { nodes: matchingNodes, edges: matchingEdges };
  }, [graph, selKategori, selStatus, selDriftform, selAvdelning, selSystem]);

  const activeFilters = selKategori.length + selStatus.length + selDriftform.length + selAvdelning.length + selSystem.length;

  const renderFilter = (
    label: string,
    options: string[],
    value: string[],
    onChange: (v: string[]) => void,
  ) => {
    if (options.length === 0) return null;
    return (
      <Autocomplete
        multiple size="small" options={options} disableCloseOnSelect
        value={value} onChange={(_, v) => onChange(v)}
        renderOption={(props, option, { selected }) => (
          <li {...props}><Checkbox icon={icon} checkedIcon={checkedIcon} sx={{ mr: 1 }} checked={selected} />{option}</li>
        )}
        renderValue={(val, getItemProps) =>
          val.map((option, index) => <Chip {...getItemProps({ index })} key={option} label={option} size="small" />)
        }
        renderInput={(params) => <TextField {...params} placeholder={label} />}
        sx={{ minWidth: 200, maxWidth: 350 }}
      />
    );
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "calc(100vh - 64px)" }}>
      <Paper elevation={0} sx={{ px: 3, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, mb: 1 }}>
          <Box>
            <Typography variant="h6">{t("landscape.title")}</Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              {t("landscape.description")}
              {activeFilters > 0 && filteredGraph && ` — ${filteredGraph.nodes.length} applikationer visas`}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
          {renderFilter(t("landscape.filterSystem"), filterOptions.system, selSystem, setSelSystem)}
          {renderFilter(t("landscape.filterStatus"), filterOptions.status, selStatus, setSelStatus)}
          {renderFilter(t("landscape.filterKategori"), filterOptions.kategori, selKategori, setSelKategori)}
          {renderFilter(t("landscape.filterDriftform"), filterOptions.driftform, selDriftform, setSelDriftform)}
          {renderFilter(t("landscape.filterAvdelning"), filterOptions.avdelning, selAvdelning, setSelAvdelning)}
        </Box>
      </Paper>

      <Box sx={{ flexGrow: 1, position: "relative", overflow: "hidden" }}>
        {isLoading && <LoadingSpinner />}
        {error && <Box sx={{ p: 3 }}><ErrorAlert error={error as Error} onRetry={refetch} /></Box>}
        {filteredGraph && !isLoading && (
          <>
            <CytoscapeGraph data={filteredGraph} layout="cose" height="100%" cyRef={cyRef} positionKey="landscape" />
            <GraphControls cyRef={cyRef} graphName="landscape" positionKey="landscape" defaultLayout={LAYOUT_OPTIONS.cose} />
            <Box sx={{ position: "absolute", bottom: 16, left: 16 }}>
              <LegendPanel />
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
};

export default Landscape;
