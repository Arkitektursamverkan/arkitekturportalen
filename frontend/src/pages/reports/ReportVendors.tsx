import React, { useMemo } from "react";
import { Box, Card, CardContent, Chip, LinearProgress, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useNodes } from "@/api/nodes";
import ReportTitle from "@/components/reports/ReportTitle";

const ReportVendors: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: nodes = [] } = useNodes();

  const { vendors, totalApps } = useMemo(() => {
    const apps = nodes.filter((n) => n.type === "Application" && !n.archived);
    const map = new Map<string, typeof apps>();
    for (const app of apps) {
      const vendor = String(app.attributes?.leverantör || "").trim() || `(${t("reports.owners.unassigned")})`;
      const list = map.get(vendor) || [];
      list.push(app);
      map.set(vendor, list);
    }
    const sorted = Array.from(map.entries())
      .map(([vendor, appList]) => ({ vendor, apps: appList.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => b.apps.length - a.apps.length);
    return { vendors: sorted, totalApps: apps.length };
  }, [nodes, t]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom><ReportTitle fallback={t("reports.vendors.title")} /></Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>{t("reports.vendors.description")}</Typography>

      <Stack direction="row" spacing={2} mb={3}>
        <Chip label={`${vendors.length} ${t("reports.vendors.vendorCount")}`} variant="outlined" />
        <Chip label={`${totalApps} ${t("reports.vendors.appCount")}`} variant="outlined" />
      </Stack>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontSize={16} fontWeight={600} mb={2}>{t("reports.vendors.distribution")}</Typography>
          <Stack spacing={1.5}>
            {vendors.slice(0, 15).map((v) => {
              const pct = totalApps > 0 ? Math.round((v.apps.length / totalApps) * 100) : 0;
              return (
                <Box key={v.vendor}>
                  <Stack direction="row" justifyContent="space-between" mb={0.3}>
                    <Typography variant="body2" fontWeight={500}>{v.vendor}</Typography>
                    <Typography variant="caption">{v.apps.length} ({pct}%)</Typography>
                  </Stack>
                  <LinearProgress variant="determinate" value={pct}
                    sx={{ height: 12, borderRadius: 6, bgcolor: "#eee",
                      "& .MuiLinearProgress-bar": { bgcolor: pct > 30 ? "#e53935" : pct > 15 ? "#ff9800" : "#4caf50" } }} />
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
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.vendors.vendor")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">{t("reports.vendors.count")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">{t("reports.vendors.share")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.vendors.applications")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {vendors.map((v) => (
              <TableRow key={v.vendor} hover>
                <TableCell><Typography variant="body2" fontWeight={500}>{v.vendor}</Typography></TableCell>
                <TableCell align="center"><Chip label={v.apps.length} size="small" /></TableCell>
                <TableCell align="center"><Typography variant="caption">{totalApps > 0 ? Math.round((v.apps.length / totalApps) * 100) : 0}%</Typography></TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {v.apps.slice(0, 8).map((app) => (
                      <Chip key={app.id} label={app.name} size="small" variant="outlined"
                        onClick={() => navigate(`/systems?id=${app.id}`)} sx={{ cursor: "pointer" }} />
                    ))}
                    {v.apps.length > 8 && <Chip label={`+${v.apps.length - 8}`} size="small" />}
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

export default ReportVendors;
