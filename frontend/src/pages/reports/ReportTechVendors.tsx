import React, { useMemo } from "react";
import { Box, Card, CardContent, Chip, LinearProgress, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useNodes } from "@/api/nodes";
import { useEdges } from "@/api/edges";
import ReportTitle from "@/components/reports/ReportTitle";

const ReportTechVendors: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: nodes = [] } = useNodes();
  const { data: edges = [] } = useEdges();

  const { vendors, totalComponents, totalApps } = useMemo(() => {
    const techs = nodes.filter((n) => n.type === "TechnologyComponent" && !n.archived);
    const appIds = new Set(nodes.filter((n) => n.type === "Application" && !n.archived).map((n) => n.id));

    // Applications that run on each component (Application → RUNS_ON → TechnologyComponent).
    const appsByTech = new Map<string, Set<string>>();
    for (const e of edges) {
      if (e.type !== "RUNS_ON" || !appIds.has(e.source_id)) continue;
      const set = appsByTech.get(e.target_id) || new Set<string>();
      set.add(e.source_id);
      appsByTech.set(e.target_id, set);
    }

    const map = new Map<string, typeof techs>();
    for (const tc of techs) {
      const vendor = String(tc.attributes?.leverantör || "").trim() || `(${t("reports.techVendors.unassigned")})`;
      const list = map.get(vendor) || [];
      list.push(tc);
      map.set(vendor, list);
    }

    const allApps = new Set<string>();
    const sorted = Array.from(map.entries())
      .map(([vendor, list]) => {
        const apps = new Set<string>();
        const types = new Set<string>();
        for (const tc of list) {
          for (const a of appsByTech.get(tc.id) ?? []) { apps.add(a); allApps.add(a); }
          const type = String(tc.attributes?.komponenttyp || "").trim();
          if (type) types.add(type);
        }
        return {
          vendor,
          components: list.sort((a, b) => a.name.localeCompare(b.name, "sv")),
          types: [...types].sort((a, b) => a.localeCompare(b, "sv")),
          appCount: apps.size,
        };
      })
      .sort((a, b) => b.components.length - a.components.length || a.vendor.localeCompare(b.vendor, "sv"));

    return { vendors: sorted, totalComponents: techs.length, totalApps: allApps.size };
  }, [nodes, edges, t]);

  const pctOf = (n: number) => (totalComponents > 0 ? Math.round((n / totalComponents) * 100) : 0);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom><ReportTitle fallback={t("reports.techVendors.title")} /></Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>{t("reports.techVendors.description")}</Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <Chip label={`${vendors.length} ${t("reports.techVendors.vendorCount")}`} variant="outlined" />
        <Chip label={`${totalComponents} ${t("reports.techVendors.componentCount")}`} variant="outlined" />
        <Chip label={`${totalApps} ${t("reports.techVendors.appCount")}`} variant="outlined" />
      </Stack>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ fontSize: 16, fontWeight: 600, mb: 2 }}>{t("reports.techVendors.distribution")}</Typography>
          <Stack spacing={1.5}>
            {vendors.slice(0, 15).map((v) => {
              const pct = pctOf(v.components.length);
              return (
                <Box key={v.vendor}>
                  <Stack direction="row" sx={{ justifyContent: "space-between", mb: 0.3 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{v.vendor}</Typography>
                    <Typography variant="caption">{v.components.length} ({pct}%)</Typography>
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
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.techVendors.vendor")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">{t("reports.techVendors.count")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">{t("reports.techVendors.share")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">{t("reports.techVendors.apps")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.techVendors.types")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.techVendors.components")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {vendors.map((v) => (
              <TableRow key={v.vendor} hover>
                <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{v.vendor}</Typography></TableCell>
                <TableCell align="center"><Chip label={v.components.length} size="small" /></TableCell>
                <TableCell align="center"><Typography variant="caption">{pctOf(v.components.length)}%</Typography></TableCell>
                <TableCell align="center"><Typography variant="caption">{v.appCount}</Typography></TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
                    {v.types.map((type) => <Chip key={type} label={type} size="small" />)}
                  </Stack>
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
                    {v.components.slice(0, 8).map((tc) => (
                      <Chip key={tc.id} label={tc.name} size="small" variant="outlined"
                        onClick={() => navigate(`/tech-components?id=${tc.id}`)} sx={{ cursor: "pointer" }} />
                    ))}
                    {v.components.length > 8 && <Chip label={`+${v.components.length - 8}`} size="small" />}
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

export default ReportTechVendors;
