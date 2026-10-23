import React, { useMemo } from "react";
import { Box, Card, CardContent, Chip, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useNodes } from "@/api/nodes";
import ReportTitle from "@/components/reports/ReportTitle";

const HOSTING_COLORS: Record<string, string> = {
  "Molntjänst": "#2196f3", "Cloud": "#2196f3", "SaaS": "#1565c0",
  "OnPrem": "#4caf50", "On-premise": "#4caf50", "On-prem": "#4caf50",
  "Hybrid": "#ff9800", "Outsourced": "#9c27b0",
};
const hostingColor = (h: string) => HOSTING_COLORS[h] || "#757575";

const ReportTechPortfolio: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: nodes = [] } = useNodes();

  const { types, hostings, cells, hostingTotals, total } = useMemo(() => {
    const techs = nodes.filter((n) => n.type === "TechnologyComponent" && !n.archived);
    const unknownType = t("reports.techPortfolio.unknownType");
    const unknownHosting = t("reports.techPortfolio.unknownHosting");

    // cells: komponenttyp → hosting → components
    const cellMap = new Map<string, Map<string, typeof techs>>();
    const hostingCount = new Map<string, number>();
    for (const tc of techs) {
      const type = String(tc.attributes?.komponenttyp || "").trim() || unknownType;
      const hosting = String(tc.attributes?.hosting || "").trim() || unknownHosting;
      const row = cellMap.get(type) || new Map<string, typeof techs>();
      const list = row.get(hosting) || [];
      list.push(tc);
      row.set(hosting, list);
      cellMap.set(type, row);
      hostingCount.set(hosting, (hostingCount.get(hosting) ?? 0) + 1);
    }

    // Largest first, but "not specified" always last.
    const order = (unknown: string) => (a: [string, number], b: [string, number]) =>
      Number(a[0] === unknown) - Number(b[0] === unknown) || b[1] - a[1] || a[0].localeCompare(b[0], "sv");
    const rowTotal = (row: Map<string, typeof techs>) => [...row.values()].reduce((s, l) => s + l.length, 0);

    return {
      types: [...cellMap.entries()].map(([k, row]) => [k, rowTotal(row)] as [string, number]).sort(order(unknownType)).map(([k]) => k),
      hostings: [...hostingCount.entries()].sort(order(unknownHosting)).map(([k]) => k),
      cells: cellMap,
      hostingTotals: hostingCount,
      total: techs.length,
    };
  }, [nodes, t]);

  const pctOf = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const maxCell = Math.max(1, ...[...cells.values()].flatMap((row) => [...row.values()].map((l) => l.length)));

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom><ReportTitle fallback={t("reports.techPortfolio.title")} /></Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>{t("reports.techPortfolio.description")}</Typography>

      <Stack direction="row" spacing={2} useFlexGap sx={{ mb: 3, flexWrap: "wrap" }}>
        <Chip label={`${total} ${t("reports.techPortfolio.componentCount")}`} variant="outlined" />
        {hostings.map((h) => (
          <Chip key={h} label={`${h}: ${hostingTotals.get(h)} (${pctOf(hostingTotals.get(h) ?? 0)}%)`}
            sx={{ bgcolor: hostingColor(h), color: "#fff", fontWeight: 600 }} />
        ))}
      </Stack>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ fontSize: 16, fontWeight: 600, mb: 2 }}>{t("reports.techPortfolio.matrix")}</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>{t("reports.techPortfolio.type")}</TableCell>
                  {hostings.map((h) => (
                    <TableCell key={h} align="center" sx={{ fontWeight: 600 }}>{h}</TableCell>
                  ))}
                  <TableCell align="center" sx={{ fontWeight: 600 }}>{t("reports.techPortfolio.total")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {types.map((type) => {
                  const row = cells.get(type)!;
                  const rowTotal = [...row.values()].reduce((s, l) => s + l.length, 0);
                  return (
                    <TableRow key={type} hover>
                      <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{type}</Typography></TableCell>
                      {hostings.map((h) => {
                        const n = row.get(h)?.length ?? 0;
                        return (
                          <TableCell key={h} align="center"
                            sx={n ? { bgcolor: `${hostingColor(h)}${Math.round(40 + (n / maxCell) * 160).toString(16).padStart(2, "0")}`, fontWeight: 600 } : { color: "text.disabled" }}>
                            {n || "–"}
                          </TableCell>
                        );
                      })}
                      <TableCell align="center"><Chip label={rowTotal} size="small" /></TableCell>
                    </TableRow>
                  );
                })}
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>{t("reports.techPortfolio.total")}</TableCell>
                  {hostings.map((h) => (
                    <TableCell key={h} align="center" sx={{ fontWeight: 600 }}>{hostingTotals.get(h)}</TableCell>
                  ))}
                  <TableCell align="center" sx={{ fontWeight: 600 }}>{total}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <TableContainer component={Card}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.techPortfolio.type")}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t("reports.techPortfolio.components")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {types.map((type) => (
              <TableRow key={type} hover>
                <TableCell sx={{ verticalAlign: "top", whiteSpace: "nowrap" }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{type}</Typography>
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
                    {hostings.flatMap((h) =>
                      [...(cells.get(type)!.get(h) ?? [])]
                        .sort((a, b) => a.name.localeCompare(b.name, "sv"))
                        .map((tc) => (
                          <Chip key={tc.id} label={tc.name} size="small" variant="outlined" title={h}
                            onClick={() => navigate(`/tech-components?id=${tc.id}`)}
                            sx={{ cursor: "pointer", borderColor: hostingColor(h), borderLeftWidth: 4 }} />
                        )),
                    )}
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

export default ReportTechPortfolio;
