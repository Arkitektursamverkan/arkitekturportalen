import React, { useMemo, useState } from "react";
import { Box, Card, CardContent, Chip, Divider, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useNodes } from "@/api/nodes";
import { useEdges } from "@/api/edges";
import { NODE_COLORS } from "@/config/graphConfig";
import ReportTitle from "@/components/reports/ReportTitle";
import { realProcesses } from "@/utils/processStructure";

interface BIARow {
  id: string; name: string;
  processes: Array<{ id: string; name: string }>;
  infoObjects: Array<{ id: string; name: string }>;
  cascadeApps: Array<{ id: string; name: string }>;
  impactScore: number;
}

function severityLevel(score: number, t: (k: string) => string): { label: string; color: "error" | "warning" | "info" | "success" } {
  if (score >= 10) return { label: t("reports.bia.critical"), color: "error" };
  if (score >= 5) return { label: t("reports.bia.high"), color: "warning" };
  if (score >= 2) return { label: t("reports.bia.medium"), color: "info" };
  return { label: t("reports.bia.low"), color: "success" };
}

const ReportBIA: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: nodes = [] } = useNodes();
  const { data: edges = [] } = useEdges();
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedApp, setSelectedApp] = useState<string | null>(null);

  const rows = useMemo<BIARow[]>(() => {
    const apps = nodes.filter((n) => n.type === "Application" && !n.archived);
    const procMap = new Map(realProcesses(nodes).map((n) => [n.id, n]));
    const ioMap = new Map(nodes.filter((n) => n.type === "InformationObject").map((n) => [n.id, n]));
    const appMap = new Map(apps.map((n) => [n.id, n]));

    return apps.map((app) => {
      // Directly affected processes
      const procs = edges
        .filter((e) => e.type === "SUPPORTS" && e.source_id === app.id)
        .map((e) => procMap.get(e.target_id))
        .filter(Boolean)
        .map((p) => ({ id: p!.id, name: p!.name }));

      // Information objects at risk
      const ios = edges
        .filter((e) => e.type === "HANDLES" && e.source_id === app.id)
        .map((e) => ioMap.get(e.target_id))
        .filter(Boolean)
        .map((o) => ({ id: o!.id, name: o!.name }));

      // Cascade: apps connected via INTEGRATES_WITH
      const cascade = edges
        .filter((e) => e.type === "INTEGRATES_WITH" && (e.source_id === app.id || e.target_id === app.id))
        .map((e) => e.source_id === app.id ? e.target_id : e.source_id)
        .filter((id) => appMap.has(id))
        .map((id) => ({ id, name: appMap.get(id)!.name }));

      const impactScore = procs.length * 2 + ios.length + cascade.length;

      return { id: app.id, name: app.name, processes: procs, infoObjects: ios, cascadeApps: cascade, impactScore };
    });
  }, [nodes, edges]);

  const sorted = useMemo(() =>
    [...rows].sort((a, b) => sortDir === "desc" ? b.impactScore - a.impactScore : a.impactScore - b.impactScore),
  [rows, sortDir]);

  const selected = selectedApp ? rows.find((r) => r.id === selectedApp) : null;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom><ReportTitle fallback={t("reports.bia.title")} /></Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>{t("reports.bia.description")}</Typography>

      <Stack direction="row" spacing={2} mb={3}>
        <Chip label={`${rows.filter((r) => r.impactScore >= 10).length} ${t("reports.bia.critical").toLowerCase()}`} color="error" size="small" />
        <Chip label={`${rows.filter((r) => r.impactScore >= 5 && r.impactScore < 10).length} ${t("reports.bia.high").toLowerCase()}`} color="warning" size="small" />
      </Stack>

      {/* Detail card when an app is selected */}
      {selected && (
        <Card sx={{ mb: 3, border: "2px solid", borderColor: "primary.main" }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>{selected.name}</Typography>
            <Chip label={severityLevel(selected.impactScore, t).label} color={severityLevel(selected.impactScore, t).color} sx={{ mb: 2 }} />

            <Typography variant="subtitle2" fontWeight={600} mt={1}>{t("reports.bia.affectedProcesses")} ({selected.processes.length})</Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap mb={1.5}>
              {selected.processes.map((p) => (
                <Chip key={p.id} label={p.name} size="small" variant="outlined"
                  sx={{ borderColor: NODE_COLORS.Process, cursor: "pointer" }}
                  onClick={() => navigate(`/processes?id=${p.id}`)} />
              ))}
              {selected.processes.length === 0 && <Typography variant="caption" color="text.secondary">—</Typography>}
            </Stack>

            <Typography variant="subtitle2" fontWeight={600}>{t("reports.bia.affectedData")} ({selected.infoObjects.length})</Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap mb={1.5}>
              {selected.infoObjects.map((o) => (
                <Chip key={o.id} label={o.name} size="small" variant="outlined"
                  sx={{ borderColor: NODE_COLORS.InformationObject, cursor: "pointer" }}
                  onClick={() => navigate(`/info-objects?id=${o.id}`)} />
              ))}
              {selected.infoObjects.length === 0 && <Typography variant="caption" color="text.secondary">—</Typography>}
            </Stack>

            <Typography variant="subtitle2" fontWeight={600}>{t("reports.bia.cascadeApps")} ({selected.cascadeApps.length})</Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {selected.cascadeApps.map((a) => (
                <Chip key={a.id} label={a.name} size="small" variant="outlined"
                  sx={{ borderColor: NODE_COLORS.Application, cursor: "pointer" }}
                  onClick={() => { setSelectedApp(a.id); }} />
              ))}
              {selected.cascadeApps.length === 0 && <Typography variant="caption" color="text.secondary">—</Typography>}
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Overview table */}
      <Typography variant="body2" color="text.secondary" mb={1}>
        {t("reports.bia.selectApp")}
      </Typography>
      <TableContainer component={Card}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.bia.application")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">{t("reports.bia.affectedProcesses")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">{t("reports.bia.affectedData")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">{t("reports.bia.cascadeApps")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">
                <TableSortLabel active direction={sortDir} onClick={() => setSortDir((d) => d === "asc" ? "desc" : "asc")}>
                  {t("reports.bia.impactScore")}
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.bia.severity")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.map((row) => {
              const level = severityLevel(row.impactScore, t);
              return (
                <TableRow key={row.id} hover selected={selectedApp === row.id}
                  sx={{ cursor: "pointer" }} onClick={() => setSelectedApp(row.id === selectedApp ? null : row.id)}>
                  <TableCell><Typography variant="body2" fontWeight={500}>{row.name}</Typography></TableCell>
                  <TableCell align="center"><Chip label={row.processes.length} size="small" /></TableCell>
                  <TableCell align="center"><Chip label={row.infoObjects.length} size="small" variant="outlined" /></TableCell>
                  <TableCell align="center"><Chip label={row.cascadeApps.length} size="small" variant="outlined" /></TableCell>
                  <TableCell align="center"><Typography variant="body2" fontWeight={700}>{row.impactScore}</Typography></TableCell>
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

export default ReportBIA;
