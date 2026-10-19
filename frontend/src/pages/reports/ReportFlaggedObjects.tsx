import React, { useMemo, useState } from "react";
import {
  Box, Card, Chip, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TableSortLabel, TextField, ToggleButton,
  ToggleButtonGroup, Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useNodes } from "@/api/nodes";
import { useAllFlags } from "@/api/flags";
import { NODE_COLORS } from "@/config/graphConfig";
import type { FlagType } from "@/types/graph";
import ReportTitle from "@/components/reports/ReportTitle";

type SortKey = "name" | "type" | "flag_type" | "created_by" | "created_at";

const FLAG_COLORS: Record<FlagType, "warning" | "default" | "error"> = {
  INCOMPLETE: "warning",
  OUTDATED: "default",
  INCORRECT: "error",
};

const TYPE_ROUTES: Record<string, string> = {
  Application: "/systems",
  Process: "/processes",
  InformationObject: "/info-objects",
  InformationSource: "/info-sources",
  TechnologyComponent: "/tech-components",
  Server: "/servers",
  ServerService: "/server-services",
};

const ReportFlaggedObjects: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: allNodes = [], isLoading: loadingNodes } = useNodes();
  const { data: allFlags = [], isLoading: loadingFlags } = useAllFlags();

  const [search, setSearch] = useState("");
  const [flagTypeFilter, setFlagTypeFilter] = useState<FlagType[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const nodeById = useMemo(
    () => new Map(allNodes.map((n) => [n.id, n])),
    [allNodes],
  );

  const rows = useMemo(() => {
    let result = allFlags
      .map((flag) => ({ flag, node: nodeById.get(flag.node_id) }))
      .filter(({ node }) => node !== undefined && !node.archived);

    if (flagTypeFilter.length) {
      result = result.filter(({ flag }) => flagTypeFilter.includes(flag.flag_type as FlagType));
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        ({ flag, node }) =>
          node!.name.toLowerCase().includes(q) ||
          (flag.description ?? "").toLowerCase().includes(q) ||
          (flag.created_by ?? "").toLowerCase().includes(q),
      );
    }

    result = [...result].sort((a, b) => {
      let av: string, bv: string;
      switch (sortBy) {
        case "name": av = a.node!.name; bv = b.node!.name; break;
        case "type": av = t(`nodeTypes.${a.node!.type}`); bv = t(`nodeTypes.${b.node!.type}`); break;
        case "flag_type": av = t(`flags.types.${a.flag.flag_type}`); bv = t(`flags.types.${b.flag.flag_type}`); break;
        case "created_by": av = a.flag.created_by ?? ""; bv = b.flag.created_by ?? ""; break;
        case "created_at": av = a.flag.created_at; bv = b.flag.created_at; break;
        default: av = ""; bv = "";
      }
      const cmp = av.localeCompare(bv, "sv");
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result as { flag: typeof allFlags[0]; node: NonNullable<ReturnType<typeof nodeById.get>> }[];
  }, [allFlags, nodeById, flagTypeFilter, search, sortBy, sortDir, t]);

  const flagTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const { flag } of rows) counts[flag.flag_type] = (counts[flag.flag_type] ?? 0) + 1;
    return counts;
  }, [rows]);

  const handleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(key); setSortDir("asc"); }
  };

  const SH = ({ k, label }: { k: SortKey; label: string }) => (
    <TableSortLabel active={sortBy === k} direction={sortBy === k ? sortDir : "asc"} onClick={() => handleSort(k)}>
      {label}
    </TableSortLabel>
  );

  const isLoading = loadingNodes || loadingFlags;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        <ReportTitle fallback={t("reports.flaggedObjects.title")} />
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        {t("reports.flaggedObjects.description")}
      </Typography>

      <Stack direction="row" spacing={1} mb={2} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField
          size="small"
          placeholder={t("common.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 220 }}
        />
        <ToggleButtonGroup
          size="small"
          value={flagTypeFilter}
          onChange={(_, v) => setFlagTypeFilter(v)}
        >
          {(["INCOMPLETE", "OUTDATED", "INCORRECT"] as FlagType[]).map((ft) => (
            <ToggleButton key={ft} value={ft} sx={{ px: 1.5 }}>
              <Typography variant="caption">{t(`flags.types.${ft}`)}</Typography>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Stack direction="row" spacing={0.5}>
          {(["INCOMPLETE", "OUTDATED", "INCORRECT"] as FlagType[]).map((ft) =>
            (flagTypeCounts[ft] ?? 0) > 0 ? (
              <Chip
                key={ft}
                label={`${t(`flags.types.${ft}`)}: ${flagTypeCounts[ft]}`}
                size="small"
                color={FLAG_COLORS[ft]}
                variant="outlined"
              />
            ) : null,
          )}
          <Chip label={`${rows.length} ${t("reports.flaggedObjects.total")}`} size="small" variant="outlined" />
        </Stack>
      </Stack>

      {isLoading ? (
        <Typography color="text.secondary">{t("common.loading")}</Typography>
      ) : rows.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
          {allFlags.length === 0
            ? t("reports.flaggedObjects.empty")
            : t("reports.flaggedObjects.noMatch")}
        </Typography>
      ) : (
        <TableContainer component={Card}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell><SH k="name" label={t("common.name")} /></TableCell>
                <TableCell><SH k="type" label={t("common.type")} /></TableCell>
                <TableCell><SH k="flag_type" label={t("flags.flagType")} /></TableCell>
                <TableCell>{t("flags.description")}</TableCell>
                <TableCell><SH k="created_by" label={t("reports.flaggedObjects.flaggedBy")} /></TableCell>
                <TableCell><SH k="created_at" label={t("reports.flaggedObjects.flaggedAt")} /></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(({ flag, node }) => {
                const route = TYPE_ROUTES[node.type];
                return (
                  <TableRow
                    key={flag.id}
                    hover
                    sx={{ cursor: route ? "pointer" : "default" }}
                    onClick={() => route && navigate(`${route}?id=${node.id}`)}
                  >
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: (NODE_COLORS as Record<string, string>)[node.type], flexShrink: 0 }} />
                        <Typography variant="body2" fontWeight={500}>{node.name}</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Chip label={t(`nodeTypes.${node.type}`)} size="small" />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={t(`flags.types.${flag.flag_type}`)}
                        size="small"
                        color={FLAG_COLORS[flag.flag_type as FlagType]}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {flag.description ?? "—"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {flag.created_by ?? "—"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(flag.created_at).toLocaleDateString("sv-SE")}
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default ReportFlaggedObjects;
