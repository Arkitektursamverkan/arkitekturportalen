import React, { useMemo } from "react";
import { Alert, Box, Card, Chip, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useNodes } from "@/api/nodes";
import { useEdges } from "@/api/edges";
import { NODE_COLORS } from "@/config/graphConfig";
import ReportTitle from "@/components/reports/ReportTitle";

function eolStatus(dateStr: string, t: (k: string) => string): { label: string; color: string } {
  if (!dateStr) return { label: t("reports.techDebt.unknown"), color: "#bdbdbd" };
  const d = new Date(dateStr);
  const now = new Date();
  const monthsLeft = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30);
  if (monthsLeft < 0) return { label: t("reports.techDebt.expired"), color: "#e53935" };
  if (monthsLeft < 12) return { label: t("reports.techDebt.warning"), color: "#ff9800" };
  return { label: t("reports.techDebt.ok"), color: "#4caf50" };
}

const ReportTechDebt: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: nodes = [] } = useNodes();
  const { data: edges = [] } = useEdges();

  const { rows, hasData } = useMemo(() => {
    const techs = nodes.filter((n) => n.type === "TechnologyComponent" && !n.archived);
    const appMap = new Map(nodes.filter((n) => n.type === "Application").map((n) => [n.id, n]));

    const runsOnMap = new Map<string, string[]>();
    for (const e of edges) {
      if (e.type === "RUNS_ON") {
        const app = appMap.get(e.source_id);
        if (app) {
          const list = runsOnMap.get(e.target_id) || [];
          list.push(app.name);
          runsOnMap.set(e.target_id, list);
        }
      }
    }

    const result = techs.map((tc) => ({
      id: tc.id, name: tc.name,
      type: String(tc.attributes?.komponenttyp || tc.attributes?.type || ""),
      vendor: String(tc.attributes?.leverantör || ""),
      endOfSupport: String(tc.attributes?.end_of_support || ""),
      endOfLife: String(tc.attributes?.end_of_life || ""),
      dependentApps: runsOnMap.get(tc.id) || [],
    }));

    result.sort((a, b) => {
      const aEol = a.endOfLife || a.endOfSupport;
      const bEol = b.endOfLife || b.endOfSupport;
      if (aEol && !bEol) return -1;
      if (!aEol && bEol) return 1;
      if (aEol && bEol) return aEol.localeCompare(bEol);
      return b.dependentApps.length - a.dependentApps.length;
    });

    return { rows: result, hasData: result.some((r) => r.endOfSupport || r.endOfLife) };
  }, [nodes, edges]);

  const expiredCount = rows.filter((r) => {
    const s = eolStatus(r.endOfLife || r.endOfSupport, t);
    return s.label === t("reports.techDebt.expired");
  }).length;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom><ReportTitle fallback={t("reports.techDebt.title")} /></Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>{t("reports.techDebt.description")}</Typography>

      {!hasData && <Alert severity="info" sx={{ mb: 3 }}>{t("reports.techDebt.hint")}</Alert>}

      <Stack direction="row" spacing={2} mb={3}>
        <Chip label={`${rows.length} ${t("reports.techDebt.component").toLowerCase()}`} variant="outlined" />
        {expiredCount > 0 && <Chip label={`${expiredCount} ${t("reports.techDebt.expired").toLowerCase()}`} color="error" size="small" />}
      </Stack>

      <TableContainer component={Card}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.techDebt.component")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.techDebt.type")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.techDebt.vendor")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.techDebt.endOfSupport")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.techDebt.endOfLife")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">{t("reports.techDebt.dependentApps")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const status = eolStatus(row.endOfLife || row.endOfSupport, t);
              return (
                <TableRow key={row.id} hover sx={{ cursor: "pointer", bgcolor: status.color === "#e53935" ? "error.50" : status.color === "#ff9800" ? "warning.50" : undefined }}
                  onClick={() => navigate(`/tech-components?id=${row.id}`)}>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: NODE_COLORS.TechnologyComponent }} />
                      <Typography variant="body2" fontWeight={500}>{row.name}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell><Typography variant="caption">{row.type}</Typography></TableCell>
                  <TableCell><Typography variant="caption">{row.vendor}</Typography></TableCell>
                  <TableCell>
                    {row.endOfSupport
                      ? <Chip label={row.endOfSupport} size="small" sx={{ bgcolor: eolStatus(row.endOfSupport, t).color, color: "#fff" }} />
                      : <Typography variant="caption" color="text.secondary">—</Typography>}
                  </TableCell>
                  <TableCell>
                    {row.endOfLife
                      ? <Chip label={row.endOfLife} size="small" sx={{ bgcolor: eolStatus(row.endOfLife, t).color, color: "#fff" }} />
                      : <Typography variant="caption" color="text.secondary">—</Typography>}
                  </TableCell>
                  <TableCell align="center"><Chip label={row.dependentApps.length} size="small" variant="outlined" /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default ReportTechDebt;
