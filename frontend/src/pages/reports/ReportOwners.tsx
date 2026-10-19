import React, { useMemo, useState } from "react";
import { Box, Card, Chip, FormControl, InputLabel, MenuItem, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useNodes } from "@/api/nodes";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ReportTitle from "@/components/reports/ReportTitle";

type GroupBy = "systemägare" | "systemförvaltare" | "avdelning";

const ReportOwners: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: nodes = [] } = useNodes();
  const [groupBy, setGroupBy] = useState<GroupBy>("systemägare");

  const { groups, unowned } = useMemo(() => {
    const apps = nodes.filter((n) => n.type === "Application" && !n.archived);
    const map = new Map<string, typeof apps>();
    const noOwner: typeof apps = [];
    for (const app of apps) {
      const value = String(app.attributes?.[groupBy] || app.attributes?.["avdelning/enhet"] || "").trim();
      if (!value) { noOwner.push(app); continue; }
      const list = map.get(value) || [];
      list.push(app);
      map.set(value, list);
    }
    const sorted = Array.from(map.entries())
      .map(([owner, appList]) => ({ owner, apps: appList.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => b.apps.length - a.apps.length);
    return { groups: sorted, unowned: noOwner.sort((a, b) => a.name.localeCompare(b.name)) };
  }, [nodes, groupBy]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom><ReportTitle fallback={t("reports.owners.title")} /></Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>{t("reports.owners.description")}</Typography>

      <Stack direction="row" spacing={2} mb={3} alignItems="center">
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>{t("reports.owners.groupBy")}</InputLabel>
          <Select value={groupBy} label={t("reports.owners.groupBy")} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
            <MenuItem value="systemägare">{t("reports.owners.systemOwner")}</MenuItem>
            <MenuItem value="systemförvaltare">{t("reports.owners.systemManager")}</MenuItem>
            <MenuItem value="avdelning">{t("reports.owners.department")}</MenuItem>
          </Select>
        </FormControl>
        <Chip label={`${groups.length}`} variant="outlined" />
        {unowned.length > 0 && <Chip icon={<WarningAmberIcon />} label={`${unowned.length} ${t("reports.owners.unassigned").toLowerCase()}`} color="warning" size="small" />}
      </Stack>

      {groups.map((g) => (
        <Card key={g.owner} sx={{ mb: 2 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: "grey.50" }}>
                  <TableCell colSpan={3}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="subtitle2" fontWeight={700}>{g.owner}</Typography>
                      <Chip label={g.apps.length} size="small" />
                    </Stack>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {g.apps.map((app) => (
                  <TableRow key={app.id} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/systems?id=${app.id}`)}>
                    <TableCell><Typography variant="body2">{app.name}</Typography></TableCell>
                    <TableCell><Typography variant="caption" color="text.secondary">{String(app.attributes?.kategori || "")}</Typography></TableCell>
                    <TableCell><Typography variant="caption" color="text.secondary">{String(app.attributes?.status || "")}</Typography></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      ))}

      {unowned.length > 0 && (
        <Card sx={{ border: "2px solid", borderColor: "warning.main" }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: "warning.50" }}>
                  <TableCell colSpan={3}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <WarningAmberIcon color="warning" fontSize="small" />
                      <Typography variant="subtitle2" fontWeight={700} color="warning.dark">
                        {t("reports.owners.unassigned")} ({t("reports.owners.unassignedDesc")})
                      </Typography>
                      <Chip label={unowned.length} size="small" color="warning" />
                    </Stack>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {unowned.map((app) => (
                  <TableRow key={app.id} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/systems?id=${app.id}`)}>
                    <TableCell><Typography variant="body2">{app.name}</Typography></TableCell>
                    <TableCell><Typography variant="caption" color="text.secondary">{String(app.attributes?.kategori || "")}</Typography></TableCell>
                    <TableCell><Typography variant="caption" color="text.secondary">{String(app.attributes?.status || "")}</Typography></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}
    </Box>
  );
};

export default ReportOwners;
