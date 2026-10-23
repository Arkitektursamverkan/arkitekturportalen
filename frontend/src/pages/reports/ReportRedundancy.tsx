import React, { useMemo } from "react";
import { Box, Card, CardContent, Chip, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useNodes } from "@/api/nodes";
import { useEdges } from "@/api/edges";
import ReportTitle from "@/components/reports/ReportTitle";
import { realProcesses } from "@/utils/processStructure";

const ReportRedundancy: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: nodes = [] } = useNodes();
  const { data: edges = [] } = useEdges();

  const groups = useMemo(() => {
    const appMap = new Map(nodes.filter((n) => n.type === "Application").map((n) => [n.id, n]));
    const procMap = new Map(realProcesses(nodes).map((n) => [n.id, n]));
    const processApps = new Map<string, string[]>();
    for (const e of edges) {
      if (e.type === "SUPPORTS" && appMap.has(e.source_id) && procMap.has(e.target_id)) {
        const list = processApps.get(e.target_id) || [];
        list.push(e.source_id);
        processApps.set(e.target_id, list);
      }
    }
    const redundant: Array<{ process: { id: string; name: string }; apps: Array<{ id: string; name: string }> }> = [];
    for (const [procId, appIds] of processApps) {
      if (appIds.length > 1) {
        const proc = procMap.get(procId);
        if (proc) {
          redundant.push({
            process: { id: proc.id, name: proc.name },
            apps: appIds.map((id) => ({ id, name: appMap.get(id)?.name || id })).sort((a, b) => a.name.localeCompare(b.name)),
          });
        }
      }
    }
    redundant.sort((a, b) => b.apps.length - a.apps.length);
    return redundant;
  }, [nodes, edges]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom><ReportTitle fallback={t("reports.redundancy.title")} /></Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>{t("reports.redundancy.description")}</Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <Chip label={`${groups.length} ${t("reports.redundancy.processesWithRedundancy")}`} color={groups.length > 0 ? "warning" : "success"} />
      </Stack>

      {groups.length === 0 ? (
        <Card><CardContent><Typography sx={{ color: "text.secondary" }}>{t("reports.redundancy.noRedundancy")}</Typography></CardContent></Card>
      ) : (
        <TableContainer component={Card}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>{t("reports.redundancy.process")}</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">{t("reports.redundancy.appCount")}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{t("reports.redundancy.supportingApps")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {groups.map((g) => (
                <TableRow key={g.process.id} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/processes?id=${g.process.id}`)}>
                  <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{g.process.name}</Typography></TableCell>
                  <TableCell align="center"><Chip label={g.apps.length} size="small" color="warning" /></TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
                      {g.apps.map((app) => (
                        <Chip key={app.id} label={app.name} size="small" variant="outlined"
                          onClick={(e) => { e.stopPropagation(); navigate(`/systems?id=${app.id}`); }} />
                      ))}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default ReportRedundancy;
