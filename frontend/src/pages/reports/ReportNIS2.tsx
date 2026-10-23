import React, { useMemo } from "react";
import { Alert, Box, Card, Chip, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useNodes } from "@/api/nodes";
import { useEdges } from "@/api/edges";
import ReportTitle from "@/components/reports/ReportTitle";
import { realProcesses } from "@/utils/processStructure";

const CAT_COLORS: Record<string, string> = { essential: "#e53935", important: "#ff9800" };

const ReportNIS2: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: nodes = [] } = useNodes();
  const { data: edges = [] } = useEdges();

  const { rows, hasData } = useMemo(() => {
    const processes = realProcesses(nodes);
    const appMap = new Map(nodes.filter((n) => n.type === "Application").map((n) => [n.id, n]));

    const appsByProcess = new Map<string, string[]>();
    for (const e of edges) {
      if (e.type === "SUPPORTS") {
        const app = appMap.get(e.source_id);
        if (app) {
          const list = appsByProcess.get(e.target_id) || [];
          list.push(e.source_id);
          appsByProcess.set(e.target_id, list);
        }
      }
    }

    const result = processes.map((proc) => {
      const category = String(proc.attributes?.nis2_category || "").toLowerCase();
      const appIds = appsByProcess.get(proc.id) || [];
      const apps = appIds.map((id) => appMap.get(id)!).filter(Boolean);
      const measures = apps
        .map((a) => String(a.attributes?.security_measures || ""))
        .filter(Boolean);

      return {
        id: proc.id, name: proc.name, category,
        apps: apps.map((a) => ({ id: a.id, name: a.name })),
        hasMeasures: measures.length > 0,
        measures,
      };
    }).filter((r) => r.category === "essential" || r.category === "important");

    result.sort((a, b) => {
      if (a.category !== b.category) return a.category === "essential" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return { rows: result, hasData: result.length > 0 };
  }, [nodes, edges]);

  const essentialCount = rows.filter((r) => r.category === "essential").length;
  const importantCount = rows.filter((r) => r.category === "important").length;
  const gapsCount = rows.filter((r) => !r.hasMeasures).length;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom><ReportTitle fallback={t("reports.nis2.title")} /></Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>{t("reports.nis2.description")}</Typography>

      {!hasData && (
        <Alert severity="info" sx={{ mb: 3 }}>{t("reports.nis2.hint")}</Alert>
      )}

      {hasData && (
        <>
          <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
            <Chip label={`${essentialCount} ${t("reports.nis2.essential")}`} sx={{ bgcolor: CAT_COLORS.essential, color: "#fff" }} />
            <Chip label={`${importantCount} ${t("reports.nis2.important")}`} sx={{ bgcolor: CAT_COLORS.important, color: "#fff" }} />
            {gapsCount > 0 && <Chip label={`${gapsCount} ${t("reports.nis2.noMeasures").toLowerCase()}`} color="error" size="small" />}
          </Stack>

          <TableContainer component={Card}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>{t("reports.nis2.process")}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t("reports.nis2.category")}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t("reports.nis2.supportingApps")}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t("reports.nis2.securityMeasures")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} hover sx={{ cursor: "pointer", bgcolor: !row.hasMeasures ? "error.50" : undefined }}
                    onClick={() => navigate(`/processes?id=${row.id}`)}>
                    <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{row.name}</Typography></TableCell>
                    <TableCell>
                      <Chip label={row.category === "essential" ? t("reports.nis2.essential") : t("reports.nis2.important")}
                        size="small" sx={{ bgcolor: CAT_COLORS[row.category], color: "#fff" }} />
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
                        {row.apps.map((a) => <Chip key={a.id} label={a.name} size="small" variant="outlined" />)}
                        {row.apps.length === 0 && <Typography variant="caption" color="error">—</Typography>}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      {row.hasMeasures
                        ? <Chip label="OK" size="small" color="success" />
                        : <Chip label={t("reports.nis2.noMeasures")} size="small" color="error" />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Box>
  );
};

export default ReportNIS2;
