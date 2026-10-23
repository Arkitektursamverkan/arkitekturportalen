import React, { useMemo, useState } from "react";
import { Box, Card, Chip, FormControl, InputLabel, MenuItem, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useNodes } from "@/api/nodes";
import { useEdges } from "@/api/edges";
import ReportTitle from "@/components/reports/ReportTitle";
import { realProcesses } from "@/utils/processStructure";

const ReportProcessSupport: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: nodes = [] } = useNodes();
  const { data: edges = [] } = useEdges();
  const [filterStatus, setFilterStatus] = useState("all");

  const { processes, processAppMap } = useMemo(() => {
    const procs = realProcesses(nodes);
    const appMap = new Map(nodes.filter((n) => n.type === "Application").map((a) => [a.id, a]));

    const map = new Map<string, string[]>();
    for (const e of edges) {
      if (e.type === "SUPPORTS") {
        const app = appMap.get(e.source_id);
        if (app) {
          const list = map.get(e.target_id) || [];
          list.push(app.name);
          map.set(e.target_id, list);
        }
      }
    }
    procs.sort((a, b) => a.name.localeCompare(b.name));
    return { processes: procs, processAppMap: map };
  }, [nodes, edges]);

  const filtered = useMemo(() => {
    if (filterStatus === "all") return processes;
    if (filterStatus === "gap") return processes.filter((p) => !processAppMap.has(p.id) || processAppMap.get(p.id)!.length === 0);
    if (filterStatus === "overlap") return processes.filter((p) => (processAppMap.get(p.id)?.length || 0) > 1);
    if (filterStatus === "covered") return processes.filter((p) => (processAppMap.get(p.id)?.length || 0) === 1);
    return processes;
  }, [processes, processAppMap, filterStatus]);

  const gapCount = processes.filter((p) => !processAppMap.has(p.id)).length;
  const overlapCount = processes.filter((p) => (processAppMap.get(p.id)?.length || 0) > 1).length;
  const coveredCount = processes.filter((p) => (processAppMap.get(p.id)?.length || 0) === 1).length;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom><ReportTitle fallback={t("reports.processSupport.title")} /></Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>{t("reports.processSupport.description")}</Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 3, alignItems: "center" }}>
        <Chip label={`${processes.length} ${t("reports.processSupport.process").toLowerCase()}`} variant="outlined" />
        <Chip label={`${coveredCount} ${t("reports.processSupport.covered").toLowerCase()}`} color="success" size="small" />
        <Chip label={`${overlapCount} ${t("reports.processSupport.overlap").toLowerCase()}`} color="warning" size="small" />
        <Chip label={`${gapCount} ${t("reports.processSupport.gap").toLowerCase()}`} color="error" size="small" />
        <Box sx={{ flexGrow: 1 }} />
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>{t("reports.processSupport.filterLabel")}</InputLabel>
          <Select value={filterStatus} label={t("reports.processSupport.filterLabel")} onChange={(e) => setFilterStatus(e.target.value)}>
            <MenuItem value="all">{t("reports.processSupport.all")} ({processes.length})</MenuItem>
            <MenuItem value="gap">{t("reports.processSupport.gap")} ({gapCount})</MenuItem>
            <MenuItem value="overlap">{t("reports.processSupport.overlap")} ({overlapCount})</MenuItem>
            <MenuItem value="covered">{t("reports.processSupport.covered")} ({coveredCount})</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      <TableContainer component={Card}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.processSupport.process")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.processSupport.status")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.processSupport.supportingApps")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">{t("reports.processSupport.count")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((proc) => {
              const supportingApps = processAppMap.get(proc.id) || [];
              const count = supportingApps.length;
              const statusColor = count === 0 ? "error" : count > 1 ? "warning" : "success";
              const statusLabel = count === 0 ? t("reports.processSupport.gap") : count > 1 ? t("reports.processSupport.overlap") : "OK";
              return (
                <TableRow key={proc.id} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/processes?id=${proc.id}`)}>
                  <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{proc.name}</Typography></TableCell>
                  <TableCell><Chip label={statusLabel} size="small" color={statusColor} /></TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
                      {supportingApps.map((name) => <Chip key={name} label={name} size="small" variant="outlined" />)}
                      {count === 0 && <Typography variant="caption" color="error">{t("reports.processSupport.noSupport")}</Typography>}
                    </Stack>
                  </TableCell>
                  <TableCell align="center"><Chip label={count} size="small" color={statusColor} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default ReportProcessSupport;
