import React, { useMemo, useState } from "react";
import { Box, Card, CardContent, Chip, FormControl, InputLabel, LinearProgress, MenuItem, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useNodes } from "@/api/nodes";
import ReportTitle from "@/components/reports/ReportTitle";

const STATUS_COLORS: Record<string, string> = {
  "Aktiv": "#4caf50", "Active": "#4caf50",
  "Planerad": "#2196f3", "Planned": "#2196f3",
  "Under utvärdering": "#ff9800", "Under review": "#ff9800",
  "Avveckling": "#e53935", "Phase-out": "#e53935",
  "Avvecklad": "#9e9e9e", "Retired": "#9e9e9e",
};

const ReportLifecycle: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: nodes = [] } = useNodes();
  const [filterStatus, setFilterStatus] = useState("all");

  const { groups, totalApps, statusOptions } = useMemo(() => {
    const apps = nodes.filter((n) => n.type === "Application" && !n.archived);
    const map = new Map<string, typeof apps>();
    for (const app of apps) {
      const status = String(app.attributes?.status || "").trim() || t("reports.lifecycle.unknown");
      const list = map.get(status) || [];
      list.push(app);
      map.set(status, list);
    }
    const sorted = Array.from(map.entries())
      .map(([status, appList]) => ({ status, apps: appList.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => b.apps.length - a.apps.length);
    return { groups: sorted, totalApps: apps.length, statusOptions: sorted.map((g) => g.status) };
  }, [nodes, t]);

  const filtered = filterStatus === "all" ? groups : groups.filter((g) => g.status === filterStatus);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom><ReportTitle fallback={t("reports.lifecycle.title")} /></Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>{t("reports.lifecycle.description")}</Typography>

      <Stack direction="row" spacing={1} mb={3} alignItems="center" flexWrap="wrap" useFlexGap>
        {groups.map((g) => (
          <Chip key={g.status} label={`${g.status}: ${g.apps.length}`}
            sx={{ bgcolor: STATUS_COLORS[g.status] || "#757575", color: "#fff", fontWeight: 600, cursor: "pointer" }}
            onClick={() => setFilterStatus(g.status === filterStatus ? "all" : g.status)} />
        ))}
        <Box flexGrow={1} />
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>{t("reports.lifecycle.status")}</InputLabel>
          <Select value={filterStatus} label={t("reports.lifecycle.status")} onChange={(e) => setFilterStatus(e.target.value)}>
            <MenuItem value="all">{t("reports.processSupport.all")} ({totalApps})</MenuItem>
            {statusOptions.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select>
        </FormControl>
      </Stack>

      {/* Distribution bars */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontSize={16} fontWeight={600} mb={2}>{t("reports.lifecycle.distribution")}</Typography>
          <Stack spacing={1.5}>
            {groups.map((g) => {
              const pct = totalApps > 0 ? Math.round((g.apps.length / totalApps) * 100) : 0;
              return (
                <Box key={g.status}>
                  <Stack direction="row" justifyContent="space-between" mb={0.3}>
                    <Typography variant="body2" fontWeight={500}>{g.status}</Typography>
                    <Typography variant="caption">{g.apps.length} ({pct}%)</Typography>
                  </Stack>
                  <LinearProgress variant="determinate" value={pct}
                    sx={{ height: 12, borderRadius: 6, bgcolor: "#eee",
                      "& .MuiLinearProgress-bar": { bgcolor: STATUS_COLORS[g.status] || "#757575" } }} />
                </Box>
              );
            })}
          </Stack>
        </CardContent>
      </Card>

      {/* Application list */}
      <TableContainer component={Card}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.lifecycle.application")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.lifecycle.status")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.lifecycle.department")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.flatMap((g) => g.apps.map((app) => (
              <TableRow key={app.id} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/systems?id=${app.id}`)}>
                <TableCell><Typography variant="body2" fontWeight={500}>{app.name}</Typography></TableCell>
                <TableCell>
                  <Chip label={g.status} size="small" sx={{ bgcolor: STATUS_COLORS[g.status] || "#757575", color: "#fff" }} />
                </TableCell>
                <TableCell><Typography variant="caption">{String(app.attributes?.avdelning || app.attributes?.["avdelning/enhet"] || "")}</Typography></TableCell>
              </TableRow>
            )))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default ReportLifecycle;
