import React, { useMemo, useState } from "react";
import { Alert, Box, Card, Chip, FormControl, InputLabel, MenuItem, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useNodes } from "@/api/nodes";
import { useEdges } from "@/api/edges";
import ReportTitle from "@/components/reports/ReportTitle";
import { realProcesses } from "@/utils/processStructure";

const ReportGDPR: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: nodes = [] } = useNodes();
  const { data: edges = [] } = useEdges();
  const [filter, setFilter] = useState<"all" | "personal">("all");

  const { rows, hasPersonalData } = useMemo(() => {
    const infoObjs = nodes.filter((n) => n.type === "InformationObject" && !n.archived);
    const appMap = new Map(nodes.filter((n) => n.type === "Application").map((n) => [n.id, n]));
    const procMap = new Map(realProcesses(nodes).map((n) => [n.id, n]));

    // Info object → handling apps
    const handlesMap = new Map<string, string[]>();
    for (const e of edges) {
      if (e.type === "HANDLES") {
        const app = appMap.get(e.source_id);
        if (app) {
          const list = handlesMap.get(e.target_id) || [];
          list.push(app.id);
          handlesMap.set(e.target_id, list);
        }
      }
    }

    // App → supported processes (for purpose)
    const appProcesses = new Map<string, string[]>();
    for (const e of edges) {
      if (e.type === "SUPPORTS") {
        const proc = procMap.get(e.target_id);
        if (proc) {
          const list = appProcesses.get(e.source_id) || [];
          list.push(proc.name);
          appProcesses.set(e.source_id, list);
        }
      }
    }

    const result = infoObjs.map((obj) => {
      const containsPersonal = String(obj.attributes?.contains_personal_data || "").toLowerCase();
      const isPersonal = containsPersonal === "true" || containsPersonal === "yes" || containsPersonal === "ja";
      const appIds = handlesMap.get(obj.id) || [];
      const apps = appIds.map((id) => appMap.get(id)!).filter(Boolean);
      const purposes = new Set<string>();
      for (const appId of appIds) {
        for (const p of appProcesses.get(appId) || []) purposes.add(p);
      }

      return {
        id: obj.id, name: obj.name,
        isPersonal,
        legalBasis: String(obj.attributes?.legal_basis || ""),
        retentionPeriod: String(obj.attributes?.retention_period || ""),
        apps: apps.map((a) => ({ id: a.id, name: a.name })),
        purposes: Array.from(purposes),
      };
    });

    result.sort((a, b) => {
      if (a.isPersonal !== b.isPersonal) return a.isPersonal ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return { rows: result, hasPersonalData: result.some((r) => r.isPersonal) };
  }, [nodes, edges]);

  const filtered = filter === "personal" ? rows.filter((r) => r.isPersonal) : rows;
  const personalCount = rows.filter((r) => r.isPersonal).length;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom><ReportTitle fallback={t("reports.gdpr.title")} /></Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>{t("reports.gdpr.description")}</Typography>

      {!hasPersonalData && (
        <Alert severity="info" sx={{ mb: 3 }}>{t("reports.gdpr.hint")}</Alert>
      )}

      <Stack direction="row" spacing={2} mb={3} alignItems="center">
        <Chip label={`${personalCount} ${t("reports.gdpr.personalData").toLowerCase()}`} color={personalCount > 0 ? "warning" : "default"} />
        <Chip label={`${rows.length} ${t("reports.gdpr.allObjects").toLowerCase()}`} variant="outlined" />
        <Box flexGrow={1} />
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>{t("reports.processSupport.filterLabel")}</InputLabel>
          <Select value={filter} label={t("reports.processSupport.filterLabel")} onChange={(e) => setFilter(e.target.value as "all" | "personal")}>
            <MenuItem value="all">{t("reports.gdpr.allObjects")}</MenuItem>
            <MenuItem value="personal">{t("reports.gdpr.personalDataOnly")}</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      <TableContainer component={Card}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.gdpr.infoObject")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.gdpr.personalData")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.gdpr.legalBasis")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.gdpr.retentionPeriod")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.gdpr.handlingApps")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.gdpr.processes")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((row) => (
              <TableRow key={row.id} hover sx={{ cursor: "pointer", bgcolor: row.isPersonal ? "warning.50" : undefined }}
                onClick={() => navigate(`/info-objects?id=${row.id}`)}>
                <TableCell><Typography variant="body2" fontWeight={500}>{row.name}</Typography></TableCell>
                <TableCell>
                  <Chip label={row.isPersonal ? t("reports.gdpr.yes") : t("reports.gdpr.no")}
                    size="small" color={row.isPersonal ? "warning" : "default"} />
                </TableCell>
                <TableCell><Typography variant="caption">{row.legalBasis || t("reports.gdpr.notSet")}</Typography></TableCell>
                <TableCell><Typography variant="caption">{row.retentionPeriod || t("reports.gdpr.notSet")}</Typography></TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {row.apps.map((a) => <Chip key={a.id} label={a.name} size="small" variant="outlined" />)}
                    {row.apps.length === 0 && <Typography variant="caption" color="text.secondary">—</Typography>}
                  </Stack>
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {row.purposes.slice(0, 3).map((p) => <Chip key={p} label={p} size="small" variant="outlined" />)}
                    {row.purposes.length > 3 && <Chip label={`+${row.purposes.length - 3}`} size="small" />}
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

export default ReportGDPR;
