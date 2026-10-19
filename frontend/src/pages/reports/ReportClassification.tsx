import React, { useMemo, useState } from "react";
import { Box, Card, Chip, FormControl, InputLabel, MenuItem, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useNodes } from "@/api/nodes";
import { useEdges } from "@/api/edges";
import { NODE_COLORS } from "@/config/graphConfig";
import ReportTitle from "@/components/reports/ReportTitle";

const LEVELS = ["Öppen", "Intern", "Konfidentiell", "Hemlig"];
const LEVEL_COLORS: Record<string, string> = { "Öppen": "#4caf50", "Intern": "#2196f3", "Konfidentiell": "#ff9800", "Hemlig": "#e53935" };

const ReportClassification: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: nodes = [] } = useNodes();
  const { data: edges = [] } = useEdges();
  const [filterLevel, setFilterLevel] = useState("all");

  const { rows, levelCounts } = useMemo(() => {
    const infoObjs = nodes.filter((n) => n.type === "InformationObject" && !n.archived);
    const appMap = new Map(nodes.filter((n) => n.type === "Application").map((n) => [n.id, n]));

    const handlesMap = new Map<string, string[]>();
    for (const e of edges) {
      if (e.type === "HANDLES") {
        const app = appMap.get(e.source_id);
        if (app) {
          const list = handlesMap.get(e.target_id) || [];
          list.push(app.name);
          handlesMap.set(e.target_id, list);
        }
      }
    }

    const result = infoObjs.map((obj) => ({
      id: obj.id,
      name: obj.name,
      classification: String(obj.attributes?.klassificering || obj.attributes?.classification || ""),
      apps: handlesMap.get(obj.id) || [],
    }));

    result.sort((a, b) => {
      const ai = LEVELS.indexOf(a.classification);
      const bi = LEVELS.indexOf(b.classification);
      if (ai !== bi) return (bi === -1 ? -1 : bi) - (ai === -1 ? -1 : ai);
      return a.name.localeCompare(b.name);
    });

    const counts: Record<string, number> = {};
    for (const r of result) {
      const lvl = r.classification || t("reports.classification.noClassification");
      counts[lvl] = (counts[lvl] || 0) + 1;
    }

    return { rows: result, levelCounts: counts };
  }, [nodes, edges, t]);

  const filtered = filterLevel === "all" ? rows : rows.filter((r) => (r.classification || t("reports.classification.noClassification")) === filterLevel);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom><ReportTitle fallback={t("reports.classification.title")} /></Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>{t("reports.classification.description")}</Typography>

      <Stack direction="row" spacing={1} mb={3} alignItems="center" flexWrap="wrap" useFlexGap>
        {Object.entries(levelCounts).map(([level, count]) => (
          <Chip key={level} label={`${level}: ${count}`} size="small"
            sx={{ bgcolor: LEVEL_COLORS[level] || "#999", color: "#fff", fontWeight: 600 }} />
        ))}
        <Box flexGrow={1} />
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>{t("reports.classification.classification")}</InputLabel>
          <Select value={filterLevel} label={t("reports.classification.classification")} onChange={(e) => setFilterLevel(e.target.value)}>
            <MenuItem value="all">{t("reports.classification.allLevels")}</MenuItem>
            {LEVELS.map((l) => <MenuItem key={l} value={l}>{l}</MenuItem>)}
            <MenuItem value={t("reports.classification.noClassification")}>{t("reports.classification.noClassification")}</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      <TableContainer component={Card}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.classification.infoObject")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.classification.classification")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.classification.handlingApps")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((row) => (
              <TableRow key={row.id} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/info-objects?id=${row.id}`)}>
                <TableCell>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: NODE_COLORS.InformationObject, flexShrink: 0 }} />
                    <Typography variant="body2" fontWeight={500}>{row.name}</Typography>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Chip label={row.classification || t("reports.classification.noClassification")} size="small"
                    sx={{ bgcolor: LEVEL_COLORS[row.classification] || "#bdbdbd", color: "#fff", fontWeight: 600 }} />
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {row.apps.map((name) => <Chip key={name} label={name} size="small" variant="outlined" />)}
                    {row.apps.length === 0 && <Typography variant="caption" color="text.secondary">—</Typography>}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default ReportClassification;
