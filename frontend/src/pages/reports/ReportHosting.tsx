import React, { useMemo } from "react";
import { Box, Card, CardContent, Chip, LinearProgress, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useNodes } from "@/api/nodes";
import ReportTitle from "@/components/reports/ReportTitle";

const HOSTING_COLORS: Record<string, string> = {
  "Molntjänst": "#2196f3", "Cloud": "#2196f3", "SaaS": "#1565c0",
  "On-premise": "#4caf50", "On-prem": "#4caf50",
  "Hybrid": "#ff9800", "Outsourced": "#9c27b0",
};

const ReportHosting: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: nodes = [] } = useNodes();

  const { groups, totalApps } = useMemo(() => {
    const apps = nodes.filter((n) => n.type === "Application" && !n.archived);
    const map = new Map<string, typeof apps>();
    for (const app of apps) {
      const driftform = String(app.attributes?.driftform || "").trim() || t("reports.hosting.unknown");
      const list = map.get(driftform) || [];
      list.push(app);
      map.set(driftform, list);
    }
    const sorted = Array.from(map.entries())
      .map(([driftform, appList]) => ({ driftform, apps: appList.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => b.apps.length - a.apps.length);
    return { groups: sorted, totalApps: apps.length };
  }, [nodes, t]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom><ReportTitle fallback={t("reports.hosting.title")} /></Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>{t("reports.hosting.description")}</Typography>

      <Stack direction="row" spacing={2} mb={3}>
        {groups.map((g) => (
          <Chip key={g.driftform} label={`${g.driftform}: ${g.apps.length}`}
            sx={{ bgcolor: HOSTING_COLORS[g.driftform] || "#757575", color: "#fff", fontWeight: 600 }} />
        ))}
      </Stack>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontSize={16} fontWeight={600} mb={2}>{t("reports.hosting.distribution")}</Typography>
          <Stack spacing={1.5}>
            {groups.map((g) => {
              const pct = totalApps > 0 ? Math.round((g.apps.length / totalApps) * 100) : 0;
              return (
                <Box key={g.driftform}>
                  <Stack direction="row" justifyContent="space-between" mb={0.3}>
                    <Typography variant="body2" fontWeight={500}>{g.driftform}</Typography>
                    <Typography variant="caption">{g.apps.length} ({pct}%)</Typography>
                  </Stack>
                  <LinearProgress variant="determinate" value={pct}
                    sx={{ height: 12, borderRadius: 6, bgcolor: "#eee",
                      "& .MuiLinearProgress-bar": { bgcolor: HOSTING_COLORS[g.driftform] || "#757575" } }} />
                </Box>
              );
            })}
          </Stack>
        </CardContent>
      </Card>

      <TableContainer component={Card}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.hosting.driftform")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">{t("reports.hosting.count")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">{t("reports.hosting.share")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.hosting.applications")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {groups.map((g) => (
              <TableRow key={g.driftform} hover>
                <TableCell>
                  <Chip label={g.driftform} size="small" sx={{ bgcolor: HOSTING_COLORS[g.driftform] || "#757575", color: "#fff" }} />
                </TableCell>
                <TableCell align="center"><Chip label={g.apps.length} size="small" /></TableCell>
                <TableCell align="center">{totalApps > 0 ? Math.round((g.apps.length / totalApps) * 100) : 0}%</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {g.apps.slice(0, 10).map((app) => (
                      <Chip key={app.id} label={app.name} size="small" variant="outlined"
                        onClick={() => navigate(`/systems?id=${app.id}`)} sx={{ cursor: "pointer" }} />
                    ))}
                    {g.apps.length > 10 && <Chip label={`+${g.apps.length - 10}`} size="small" />}
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

export default ReportHosting;
