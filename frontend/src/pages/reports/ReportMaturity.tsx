import React, { useMemo } from "react";
import { Box, Card, CardContent, Chip, Grid, LinearProgress, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useNodes } from "@/api/nodes";
import { useEdges } from "@/api/edges";
import { NODE_COLORS } from "@/config/graphConfig";
import type { NodeType } from "@/types/graph";
import ReportTitle from "@/components/reports/ReportTitle";
import { realProcesses } from "@/utils/processStructure";

const TYPES: NodeType[] = ["Process", "Application", "InformationObject", "InformationSource", "TechnologyComponent"];

function Gauge({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" mb={0.5}>
        <Typography variant="body2">{label}</Typography>
        <Typography variant="body2" fontWeight={600}>{pct}% ({value}/{total})</Typography>
      </Stack>
      <LinearProgress variant="determinate" value={pct} sx={{ height: 8, borderRadius: 4, bgcolor: "#eee", "& .MuiLinearProgress-bar": { bgcolor: color } }} />
    </Box>
  );
}

const ReportMaturity: React.FC = () => {
  const { t } = useTranslation();
  const { data: nodes = [] } = useNodes();
  const { data: edges = [] } = useEdges();

  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const nt of TYPES) counts[nt] = nodes.filter((n) => n.type === nt).length;

    const apps = nodes.filter((n) => n.type === "Application");
    const processes = realProcesses(nodes);
    const infoObjects = nodes.filter((n) => n.type === "InformationObject");

    const appsSupportingProcess = new Set(edges.filter((e) => e.type === "SUPPORTS").map((e) => e.source_id));
    const processesSupportedByApp = new Set(edges.filter((e) => e.type === "SUPPORTS").map((e) => e.target_id));
    const infoObjsRealized = new Set(edges.filter((e) => e.type === "REALIZES").map((e) => e.target_id));

    const nodesWithEdges = new Set<string>();
    for (const e of edges) { nodesWithEdges.add(e.source_id); nodesWithEdges.add(e.target_id); }
    const orphans = nodes.filter((n) => !nodesWithEdges.has(n.id));
    const withDescription = nodes.filter((n) => n.description && n.description.trim().length > 0);

    return {
      counts, totalNodes: nodes.length, totalEdges: edges.length,
      appsWithSupport: appsSupportingProcess.size, totalApps: apps.length,
      processesSupported: processesSupportedByApp.size, totalProcesses: processes.length,
      infoObjsRealized: infoObjsRealized.size, totalInfoObjs: infoObjects.length,
      orphanCount: orphans.length, descriptionCount: withDescription.length,
    };
  }, [nodes, edges]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom><ReportTitle fallback={t("reports.maturity.title")} /></Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>{t("reports.maturity.description")}</Typography>

      <Grid container spacing={2} mb={3}>
        {TYPES.map((nt) => (
          <Grid item xs={6} sm={4} md key={nt}>
            <Card>
              <CardContent sx={{ textAlign: "center", py: 2 }}>
                <Box sx={{ width: 14, height: 14, borderRadius: "50%", bgcolor: NODE_COLORS[nt], mx: "auto", mb: 1 }} />
                <Typography variant="h4" fontWeight={700}>{stats.counts[nt] || 0}</Typography>
                <Typography variant="caption" color="text.secondary">{t(`nodeTypes.${nt}`)}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
        <Grid item xs={6} sm={4} md>
          <Card>
            <CardContent sx={{ textAlign: "center", py: 2 }}>
              <Typography variant="h4" fontWeight={700}>{stats.totalEdges}</Typography>
              <Typography variant="caption" color="text.secondary">{t("home.stats.connections")}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontSize={16} fontWeight={600} mb={2}>{t("reports.maturity.coverage")}</Typography>
              <Stack spacing={2}>
                <Gauge label={t("reports.maturity.appsSupporting")} value={stats.appsWithSupport} total={stats.totalApps} color="#4CAF50" />
                <Gauge label={t("reports.maturity.processesSupported")} value={stats.processesSupported} total={stats.totalProcesses} color="#2196F3" />
                <Gauge label={t("reports.maturity.infoObjRealized")} value={stats.infoObjsRealized} total={stats.totalInfoObjs} color="#FF9800" />
                <Gauge label={t("reports.maturity.nodesWithDesc")} value={stats.descriptionCount} total={stats.totalNodes} color="#9C27B0" />
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontSize={16} fontWeight={600} mb={2}>{t("reports.maturity.health")}</Typography>
              <Stack spacing={2}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2">{t("reports.maturity.orphans")}</Typography>
                  <Chip label={stats.orphanCount} size="small" color={stats.orphanCount === 0 ? "success" : stats.orphanCount < 5 ? "warning" : "error"} />
                </Stack>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2">{t("reports.maturity.unsupportedProcesses")}</Typography>
                  <Chip label={stats.totalProcesses - stats.processesSupported} size="small"
                    color={stats.totalProcesses - stats.processesSupported === 0 ? "success" : "warning"} />
                </Stack>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2">{t("reports.maturity.appsNoProcess")}</Typography>
                  <Chip label={stats.totalApps - stats.appsWithSupport} size="small"
                    color={stats.totalApps - stats.appsWithSupport === 0 ? "success" : "warning"} />
                </Stack>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2">{t("reports.maturity.completeness")}</Typography>
                  <Chip label={`${stats.totalNodes > 0 ? Math.round(((stats.totalNodes - stats.orphanCount) / stats.totalNodes) * 100) : 0}%`}
                    size="small" color="primary" />
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default ReportMaturity;
