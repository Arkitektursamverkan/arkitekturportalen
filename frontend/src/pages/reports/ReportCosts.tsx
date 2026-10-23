import React, { useMemo } from "react";
import { Alert, Box, Card, CardContent, Chip, LinearProgress, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useNodes } from "@/api/nodes";
import { useEdges } from "@/api/edges";
import ReportTitle from "@/components/reports/ReportTitle";

const ReportCosts: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: nodes = [] } = useNodes();
  const { data: edges = [] } = useEdges();
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");

  const { rows, totalCost, hasData } = useMemo(() => {
    const apps = nodes.filter((n) => n.type === "Application" && !n.archived);
    const processCount = new Map<string, number>();
    for (const e of edges) {
      if (e.type === "SUPPORTS") processCount.set(e.source_id, (processCount.get(e.source_id) || 0) + 1);
    }

    const result = apps.map((app) => {
      const cost = Number(app.attributes?.annual_cost) || 0;
      const procs = processCount.get(app.id) || 0;
      return {
        id: app.id, name: app.name, cost,
        licenseModel: String(app.attributes?.license_model || ""),
        processCount: procs,
        costPerProcess: procs > 0 ? Math.round(cost / procs) : 0,
      };
    });

    const total = result.reduce((sum, r) => sum + r.cost, 0);
    return { rows: result, totalCost: total, hasData: result.some((r) => r.cost > 0) };
  }, [nodes, edges]);

  const sorted = useMemo(() =>
    [...rows].sort((a, b) => sortDir === "desc" ? b.cost - a.cost : a.cost - b.cost),
  [rows, sortDir]);

  const fmt = (n: number) => n.toLocaleString("sv-SE");

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom><ReportTitle fallback={t("reports.costs.title")} /></Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>{t("reports.costs.description")}</Typography>

      {!hasData && <Alert severity="info" sx={{ mb: 3 }}>{t("reports.costs.hint")}</Alert>}

      {hasData && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontSize: 16, fontWeight: 600, mb: 1 }}>{t("reports.costs.totalCost")}</Typography>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>{fmt(totalCost)} kr</Typography>
            <Stack spacing={1.5} sx={{ mt: 2 }}>
              {sorted.filter((r) => r.cost > 0).slice(0, 10).map((r) => {
                const pct = totalCost > 0 ? Math.round((r.cost / totalCost) * 100) : 0;
                return (
                  <Box key={r.id}>
                    <Stack direction="row" sx={{ justifyContent: "space-between", mb: 0.3 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{r.name}</Typography>
                      <Typography variant="caption">{fmt(r.cost)} kr ({pct}%)</Typography>
                    </Stack>
                    <LinearProgress variant="determinate" value={pct}
                      sx={{ height: 10, borderRadius: 5, bgcolor: "#eee", "& .MuiLinearProgress-bar": { bgcolor: "#1565c0" } }} />
                  </Box>
                );
              })}
            </Stack>
          </CardContent>
        </Card>
      )}

      <TableContainer component={Card}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.costs.application")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">
                <TableSortLabel active direction={sortDir} onClick={() => setSortDir((d) => d === "asc" ? "desc" : "asc")}>
                  {t("reports.costs.annualCost")}
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.costs.licenseModel")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">{t("reports.costs.costPerProcess")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.map((row) => (
              <TableRow key={row.id} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/systems?id=${row.id}`)}>
                <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{row.name}</Typography></TableCell>
                <TableCell align="right">
                  {row.cost > 0
                    ? <Typography variant="body2" sx={{ fontWeight: 600 }}>{fmt(row.cost)} kr</Typography>
                    : <Typography variant="caption" sx={{ color: "text.secondary" }}>—</Typography>}
                </TableCell>
                <TableCell><Typography variant="caption">{row.licenseModel || "—"}</Typography></TableCell>
                <TableCell align="right">
                  {row.costPerProcess > 0
                    ? <Typography variant="caption">{fmt(row.costPerProcess)} kr</Typography>
                    : <Typography variant="caption" sx={{ color: "text.secondary" }}>—</Typography>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default ReportCosts;
