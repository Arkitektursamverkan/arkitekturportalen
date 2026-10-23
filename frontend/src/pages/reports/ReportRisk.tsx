import React, { useMemo, useState } from "react";
import { Alert, Box, Card, CardContent, Chip, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useNodes } from "@/api/nodes";
import { useEdges } from "@/api/edges";
import ReportTitle from "@/components/reports/ReportTitle";

interface RiskRow {
  id: string; name: string;
  businessCriticality: number; dataSensitivity: number; integrationExposure: number;
  compositeScore: number;
}

function scoreToLevel(score: number, t: (k: string) => string): { label: string; color: "error" | "warning" | "info" | "success" } {
  if (score >= 12) return { label: t("reports.risk.critical"), color: "error" };
  if (score >= 8) return { label: t("reports.risk.high"), color: "warning" };
  if (score >= 4) return { label: t("reports.risk.medium"), color: "info" };
  return { label: t("reports.risk.low"), color: "success" };
}

const ReportRisk: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: nodes = [] } = useNodes();
  const { data: edges = [] } = useEdges();
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo<RiskRow[]>(() => {
    const apps = nodes.filter((n) => n.type === "Application" && !n.archived);

    const processCount = new Map<string, number>();
    const infoObjCount = new Map<string, number>();
    const integCount = new Map<string, number>();

    for (const e of edges) {
      if (e.type === "SUPPORTS") processCount.set(e.source_id, (processCount.get(e.source_id) || 0) + 1);
      if (e.type === "HANDLES") infoObjCount.set(e.source_id, (infoObjCount.get(e.source_id) || 0) + 1);
      if (e.type === "INTEGRATES_WITH") {
        integCount.set(e.source_id, (integCount.get(e.source_id) || 0) + 1);
        integCount.set(e.target_id, (integCount.get(e.target_id) || 0) + 1);
      }
    }

    return apps.map((app) => {
      const bc = Math.min(processCount.get(app.id) || 0, 5);
      const ds = Math.min(infoObjCount.get(app.id) || 0, 5);
      const ie = Math.min(integCount.get(app.id) || 0, 5);
      return {
        id: app.id, name: app.name,
        businessCriticality: bc, dataSensitivity: ds, integrationExposure: ie,
        compositeScore: bc + ds + ie,
      };
    });
  }, [nodes, edges]);

  const sorted = useMemo(() =>
    [...rows].sort((a, b) => sortDir === "desc" ? b.compositeScore - a.compositeScore : a.compositeScore - b.compositeScore),
  [rows, sortDir]);

  const criticalCount = rows.filter((r) => r.compositeScore >= 12).length;
  const highCount = rows.filter((r) => r.compositeScore >= 8 && r.compositeScore < 12).length;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom><ReportTitle fallback={t("reports.risk.title")} /></Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>{t("reports.risk.description")}</Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <Chip label={`${criticalCount} ${t("reports.risk.critical").toLowerCase()}`} color="error" size="small" />
        <Chip label={`${highCount} ${t("reports.risk.high").toLowerCase()}`} color="warning" size="small" />
        <Chip label={`${rows.length} ${t("reports.portfolio.name").toLowerCase()}`} variant="outlined" size="small" />
      </Stack>

      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{t("reports.risk.scoring")}</Typography>
        <Typography variant="caption">{t("reports.risk.scoringDesc")}</Typography>
      </Alert>

      <TableContainer component={Card}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.risk.application")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">{t("reports.risk.businessCriticality")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">{t("reports.risk.dataSensitivity")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">{t("reports.risk.integrationExposure")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">
                <TableSortLabel active direction={sortDir} onClick={() => setSortDir((d) => d === "asc" ? "desc" : "asc")}>
                  {t("reports.risk.compositeScore")}
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.risk.riskLevel")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.map((row) => {
              const level = scoreToLevel(row.compositeScore, t);
              return (
                <TableRow key={row.id} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/systems?id=${row.id}`)}>
                  <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{row.name}</Typography></TableCell>
                  <TableCell align="center">
                    <Chip label={row.businessCriticality} size="small"
                      sx={{ bgcolor: row.businessCriticality >= 3 ? "#e53935" : row.businessCriticality >= 1 ? "#ff9800" : "#eee", color: row.businessCriticality >= 1 ? "#fff" : undefined }} />
                  </TableCell>
                  <TableCell align="center">
                    <Chip label={row.dataSensitivity} size="small"
                      sx={{ bgcolor: row.dataSensitivity >= 3 ? "#e53935" : row.dataSensitivity >= 1 ? "#ff9800" : "#eee", color: row.dataSensitivity >= 1 ? "#fff" : undefined }} />
                  </TableCell>
                  <TableCell align="center">
                    <Chip label={row.integrationExposure} size="small"
                      sx={{ bgcolor: row.integrationExposure >= 3 ? "#e53935" : row.integrationExposure >= 1 ? "#ff9800" : "#eee", color: row.integrationExposure >= 1 ? "#fff" : undefined }} />
                  </TableCell>
                  <TableCell align="center"><Typography variant="body2" sx={{ fontWeight: 700 }}>{row.compositeScore}</Typography></TableCell>
                  <TableCell><Chip label={level.label} size="small" color={level.color} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default ReportRisk;
