import React, { useMemo, useState } from "react";
import { Autocomplete, Box, Card, Chip, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, TextField, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useNodes } from "@/api/nodes";
import { useEdges } from "@/api/edges";
import ReportTitle from "@/components/reports/ReportTitle";

type SortKey = "name" | "status" | "kategori" | "driftform" | "avdelning" | "leverantör" | "processCount" | "integrationCount";

const ReportPortfolio: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: nodes = [] } = useNodes();
  const { data: edges = [] } = useEdges();

  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filterKategori, setFilterKategori] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterDriftform, setFilterDriftform] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const { apps, options } = useMemo(() => {
    const applications = nodes.filter((n) => n.type === "Application" && !n.archived);
    const processCount: Record<string, number> = {};
    const integrationCount: Record<string, number> = {};
    for (const e of edges) {
      if (e.type === "SUPPORTS") processCount[e.source_id] = (processCount[e.source_id] || 0) + 1;
      if (e.type === "INTEGRATES_WITH") {
        integrationCount[e.source_id] = (integrationCount[e.source_id] || 0) + 1;
        integrationCount[e.target_id] = (integrationCount[e.target_id] || 0) + 1;
      }
    }
    const rows = applications.map((app) => ({
      ...app, status: String(app.attributes?.status || ""),
      kategori: String(app.attributes?.kategori || app.attributes?.category || ""),
      driftform: String(app.attributes?.driftform || ""),
      avdelning: String(app.attributes?.avdelning || app.attributes?.["avdelning/enhet"] || ""),
      leverantör: String(app.attributes?.leverantör || ""),
      processCount: processCount[app.id] || 0,
      integrationCount: integrationCount[app.id] || 0,
    }));
    const unique = (key: string) => Array.from(new Set(rows.map((r) => (r as any)[key]).filter(Boolean))).sort();
    return { apps: rows, options: { kategori: unique("kategori"), status: unique("status"), driftform: unique("driftform") } };
  }, [nodes, edges]);

  const filtered = useMemo(() => {
    let result = apps;
    if (search) result = result.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()));
    if (filterKategori.length) result = result.filter((a) => filterKategori.includes(a.kategori));
    if (filterStatus.length) result = result.filter((a) => filterStatus.includes(a.status));
    if (filterDriftform.length) result = result.filter((a) => filterDriftform.includes(a.driftform));
    result.sort((a, b) => {
      const av = (a as any)[sortBy] ?? ""; const bv = (b as any)[sortBy] ?? "";
      const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [apps, search, filterKategori, filterStatus, filterDriftform, sortBy, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(key); setSortDir("asc"); }
  };
  const SH = ({ k, label }: { k: SortKey; label: string }) => (
    <TableSortLabel active={sortBy === k} direction={sortBy === k ? sortDir : "asc"} onClick={() => handleSort(k)}>{label}</TableSortLabel>
  );

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom><ReportTitle fallback={t("reports.portfolio.title")} /></Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>{t("reports.portfolio.description")}</Typography>

      <Stack direction="row" spacing={1} useFlexGap sx={{ mb: 2, flexWrap: "wrap" }}>
        <TextField size="small" placeholder={t("reports.portfolio.search")} value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 200 }} />
        <Autocomplete multiple size="small" options={options.kategori} value={filterKategori} onChange={(_, v) => setFilterKategori(v)}
          renderInput={(p) => <TextField {...p} placeholder={t("reports.portfolio.category")} />} sx={{ minWidth: 180 }} />
        <Autocomplete multiple size="small" options={options.status} value={filterStatus} onChange={(_, v) => setFilterStatus(v)}
          renderInput={(p) => <TextField {...p} placeholder={t("reports.portfolio.status")} />} sx={{ minWidth: 150 }} />
        <Autocomplete multiple size="small" options={options.driftform} value={filterDriftform} onChange={(_, v) => setFilterDriftform(v)}
          renderInput={(p) => <TextField {...p} placeholder={t("reports.portfolio.hosting")} />} sx={{ minWidth: 150 }} />
        <Chip label={`${filtered.length} / ${apps.length}`} variant="outlined" />
      </Stack>

      <TableContainer component={Card}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell><SH k="name" label={t("reports.portfolio.name")} /></TableCell>
              <TableCell><SH k="kategori" label={t("reports.portfolio.category")} /></TableCell>
              <TableCell><SH k="status" label={t("reports.portfolio.status")} /></TableCell>
              <TableCell><SH k="driftform" label={t("reports.portfolio.hosting")} /></TableCell>
              <TableCell><SH k="avdelning" label={t("reports.portfolio.department")} /></TableCell>
              <TableCell><SH k="leverantör" label={t("reports.portfolio.vendor")} /></TableCell>
              <TableCell align="center"><SH k="processCount" label={t("reports.portfolio.processes")} /></TableCell>
              <TableCell align="center"><SH k="integrationCount" label={t("reports.portfolio.integrations")} /></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((app) => (
              <TableRow key={app.id} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/systems?id=${app.id}`)}>
                <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{app.name}</Typography></TableCell>
                <TableCell><Typography variant="caption">{app.kategori}</Typography></TableCell>
                <TableCell>{app.status && <Chip label={app.status} size="small" />}</TableCell>
                <TableCell><Typography variant="caption">{app.driftform}</Typography></TableCell>
                <TableCell><Typography variant="caption">{app.avdelning}</Typography></TableCell>
                <TableCell><Typography variant="caption">{app.leverantör}</Typography></TableCell>
                <TableCell align="center"><Chip label={app.processCount} size="small" variant="outlined" /></TableCell>
                <TableCell align="center"><Chip label={app.integrationCount} size="small" variant="outlined" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default ReportPortfolio;
