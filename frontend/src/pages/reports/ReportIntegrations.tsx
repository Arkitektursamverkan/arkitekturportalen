import React, { useMemo, useState } from "react";
import { Box, Card, Chip, FormControl, InputLabel, MenuItem, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useNodes } from "@/api/nodes";
import { useEdges } from "@/api/edges";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { DIRECTION_GLYPHS, getIntegrationDirection } from "@/config/graphConfig";
import type { EdgeType } from "@/types/graph";
import ReportTitle from "@/components/reports/ReportTitle";

const ReportIntegrations: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: nodes = [] } = useNodes();
  const { data: edges = [] } = useEdges();
  const [view, setView] = useState<"hubs" | "pairs">("hubs");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { hubs, pairs } = useMemo(() => {
    const appMap = new Map(nodes.filter((n) => n.type === "Application").map((n) => [n.id, n]));
    const integEdges = edges.filter((e) => e.type === "INTEGRATES_WITH");
    const degreeMap = new Map<string, number>();
    for (const e of integEdges) {
      degreeMap.set(e.source_id, (degreeMap.get(e.source_id) || 0) + 1);
      degreeMap.set(e.target_id, (degreeMap.get(e.target_id) || 0) + 1);
    }
    const processCount = new Map<string, number>();
    for (const e of edges) {
      if (e.type === "SUPPORTS") processCount.set(e.source_id, (processCount.get(e.source_id) || 0) + 1);
    }
    const hubList = Array.from(degreeMap.entries())
      .filter(([id]) => appMap.has(id))
      .map(([id, degree]) => ({
        id, name: appMap.get(id)!.name, degree,
        processCount: processCount.get(id) || 0,
        riskScore: degree * (1 + (processCount.get(id) || 0)),
      }));
    const pairList = integEdges
      .filter((e) => appMap.has(e.source_id) && appMap.has(e.target_id))
      .map((e) => ({
        id: e.id, sourceId: e.source_id, sourceName: appMap.get(e.source_id)!.name,
        targetId: e.target_id, targetName: appMap.get(e.target_id)!.name,
        direction: getIntegrationDirection(e.type as EdgeType, e.attributes),
      }))
      .sort((a, b) => a.sourceName.localeCompare(b.sourceName));
    return { hubs: hubList, pairs: pairList };
  }, [nodes, edges]);

  const sortedHubs = useMemo(() =>
    [...hubs].sort((a, b) => sortDir === "desc" ? b.riskScore - a.riskScore : a.riskScore - b.riskScore),
  [hubs, sortDir]);

  const riskLabel = (score: number) =>
    score >= 20 ? t("reports.integrations.critical") : score >= 10 ? t("reports.integrations.high") : score >= 5 ? t("reports.integrations.medium") : t("reports.integrations.low");
  const riskColor = (score: number) =>
    score >= 20 ? "error" : score >= 10 ? "warning" : score >= 5 ? "info" : "success";

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom><ReportTitle fallback={t("reports.integrations.title")} /></Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>{t("reports.integrations.description")}</Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 3, alignItems: "center" }}>
        <Chip label={`${pairs.length} ${t("reports.integrations.integrationLinks")}`} variant="outlined" />
        <Chip label={`${hubs.length} ${t("reports.integrations.connectedApps")}`} variant="outlined" />
        {hubs.filter((h) => h.degree >= 5).length > 0 && (
          <Chip icon={<WarningAmberIcon />} label={`${hubs.filter((h) => h.degree >= 5).length} ${t("reports.integrations.highDegreeHubs")}`} color="warning" size="small" />
        )}
        <Box sx={{ flexGrow: 1 }} />
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>{t("reports.integrations.view")}</InputLabel>
          <Select value={view} label={t("reports.integrations.view")} onChange={(e) => setView(e.target.value as "hubs" | "pairs")}>
            <MenuItem value="hubs">{t("reports.integrations.hubAnalysis")}</MenuItem>
            <MenuItem value="pairs">{t("reports.integrations.allPairs")}</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      {view === "hubs" && (
        <TableContainer component={Card}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>{t("reports.integrations.application")}</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">{t("reports.integrations.integrationCount")}</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">{t("reports.integrations.processCount")}</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">
                  <TableSortLabel active direction={sortDir} onClick={() => setSortDir((d) => d === "asc" ? "desc" : "asc")}>
                    {t("reports.integrations.riskScore")}
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{t("reports.integrations.riskLevel")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedHubs.map((hub) => (
                <TableRow key={hub.id} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/systems?id=${hub.id}`)}>
                  <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{hub.name}</Typography></TableCell>
                  <TableCell align="center"><Chip label={hub.degree} size="small" /></TableCell>
                  <TableCell align="center"><Chip label={hub.processCount} size="small" variant="outlined" /></TableCell>
                  <TableCell align="center"><Typography variant="body2" sx={{ fontWeight: 600 }}>{hub.riskScore}</Typography></TableCell>
                  <TableCell><Chip label={riskLabel(hub.riskScore)} size="small" color={riskColor(hub.riskScore) as any} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {view === "pairs" && (
        <TableContainer component={Card}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>{t("reports.integrations.source")}</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>{t("reports.integrations.direction")}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{t("reports.integrations.target")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pairs.map((p) => (
                <TableRow key={p.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ cursor: "pointer", "&:hover": { textDecoration: "underline" } }}
                      onClick={() => navigate(`/systems?id=${p.sourceId}`)}>{p.sourceName}</Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Typography
                      variant="body2"
                      title={p.direction ? t(`integrationDirection.${p.direction}`) : undefined}
                      sx={{ fontWeight: 700 }}
                    >
                      {p.direction ? DIRECTION_GLYPHS[p.direction] : "—"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ cursor: "pointer", "&:hover": { textDecoration: "underline" } }}
                      onClick={() => navigate(`/systems?id=${p.targetId}`)}>{p.targetName}</Typography>
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

export default ReportIntegrations;
