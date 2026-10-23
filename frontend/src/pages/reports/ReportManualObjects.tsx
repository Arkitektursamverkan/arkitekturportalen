import React, { useMemo, useState } from "react";
import {
  Box, Card, Chip, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TableSortLabel, TextField, ToggleButton,
  ToggleButtonGroup, Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useNodes } from "@/api/nodes";
import { NODE_COLORS } from "@/config/graphConfig";
import ReportTitle from "@/components/reports/ReportTitle";

type SortKey = "name" | "type" | "created_at" | "description";

const TYPE_ROUTES: Record<string, string> = {
  Application: "/systems",
  Process: "/processes",
  InformationObject: "/info-objects",
  InformationSource: "/info-sources",
  TechnologyComponent: "/tech-components",
  Server: "/servers",
  ServerService: "/server-services",
};

const ReportManualObjects: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: allNodes = [], isLoading } = useNodes();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>("type");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const manualNodes = useMemo(
    () => allNodes.filter(
      (n) => !n.archived && n.external_source === "NONE" && n.type in TYPE_ROUTES,
    ),
    [allNodes],
  );

  const nodeTypes = useMemo(
    () => Array.from(new Set(manualNodes.map((n) => n.type))).sort(),
    [manualNodes],
  );

  const filtered = useMemo(() => {
    let result = manualNodes;
    if (typeFilter.length) result = result.filter((n) => typeFilter.includes(n.type));
    if (search) result = result.filter((n) =>
      n.name.toLowerCase().includes(search.toLowerCase()) ||
      (n.description ?? "").toLowerCase().includes(search.toLowerCase()),
    );
    result = [...result].sort((a, b) => {
      let av: string, bv: string;
      if (sortBy === "created_at") {
        av = a.created_at ?? "";
        bv = b.created_at ?? "";
      } else if (sortBy === "description") {
        av = a.description ?? "";
        bv = b.description ?? "";
      } else {
        av = (a as unknown as Record<string, string>)[sortBy] ?? "";
        bv = (b as unknown as Record<string, string>)[sortBy] ?? "";
      }
      const cmp = av.localeCompare(bv);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [manualNodes, typeFilter, search, sortBy, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(key); setSortDir("asc"); }
  };

  const handleRowClick = (node: typeof filtered[0]) => {
    const base = TYPE_ROUTES[node.type];
    if (base) navigate(`${base}?id=${node.id}`);
  };

  const SH = ({ k, label }: { k: SortKey; label: string }) => (
    <TableSortLabel
      active={sortBy === k}
      direction={sortBy === k ? sortDir : "asc"}
      onClick={() => handleSort(k)}
    >
      {label}
    </TableSortLabel>
  );

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
        <ReportTitle fallback={t("reports.manualObjects.title")} />
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 3 }}>
        {t("reports.manualObjects.description")}
      </Typography>

      <Stack direction="row" spacing={2} useFlexGap sx={{ mb: 2, alignItems: "center", flexWrap: "wrap" }}>
        <TextField
          size="small"
          placeholder={t("common.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 220 }}
        />
        <ToggleButtonGroup
          size="small"
          value={typeFilter}
          onChange={(_, v) => setTypeFilter(v)}
        >
          {nodeTypes.map((type) => (
            <ToggleButton key={type} value={type} sx={{ px: 1.5 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: (NODE_COLORS as Record<string, string>)[type], mr: 0.75, flexShrink: 0 }} />
              <Typography variant="caption">{t(`nodeTypes.${type}`)}</Typography>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Chip
          label={`${filtered.length} ${filtered.length === 1 ? "objekt" : "objekt"} / ${manualNodes.length} totalt`}
          variant="outlined"
        />
      </Stack>

      {isLoading ? (
        <Typography sx={{ color: "text.secondary" }}>{t("common.loading")}</Typography>
      ) : filtered.length === 0 ? (
        <Typography sx={{ color: "text.secondary", py: 4, textAlign: "center" }}>
          {manualNodes.length === 0
            ? t("reports.manualObjects.empty")
            : t("reports.manualObjects.noMatch")}
        </Typography>
      ) : (
        <TableContainer component={Card}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell><SH k="name" label={t("common.name")} /></TableCell>
                <TableCell><SH k="type" label={t("common.type")} /></TableCell>
                <TableCell><SH k="description" label={t("common.description")} /></TableCell>
                <TableCell><SH k="created_at" label={t("reports.manualObjects.addedAt")} /></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((node) => (
                <TableRow
                  key={node.id}
                  hover
                  sx={{ cursor: TYPE_ROUTES[node.type] ? "pointer" : "default" }}
                  onClick={() => handleRowClick(node)}
                >
                  <TableCell>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: (NODE_COLORS as Record<string, string>)[node.type], flexShrink: 0 }} />
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{node.name}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Chip label={t(`nodeTypes.${node.type}`)} size="small" />
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      {node.description ?? "—"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      {node.created_at
                        ? new Date(node.created_at).toLocaleDateString("sv-SE")
                        : "—"}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default ReportManualObjects;
