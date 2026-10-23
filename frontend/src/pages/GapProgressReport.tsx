import React, { useMemo } from "react";
import {
  Alert, Box, Chip, CircularProgress, Divider,
  LinearProgress, Paper, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow,
  Typography,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PendingIcon from "@mui/icons-material/Pending";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import CancelIcon from "@mui/icons-material/Cancel";
import { useGapAnalys } from "@/api/gapAnalys";
import { useGapTasksSummary, type GapTaskItemSummary } from "@/api/gapTasks";
import ReportTitle from "@/components/reports/ReportTitle";

// ── Constants ─────────────────────────────────────────────────────────────────

const DOMAINS = [
  "Arkitekturstyrning",
  "Verksamhetsarkitektur",
  "Informationsarkitektur",
  "Applikationsarkitektur",
  "Teknisk arkitektur",
];

const PRIORITET_COLOR: Record<string, string> = {
  HOG: "#d32f2f",
  MELLAN: "#e65100",
  MINDRE: "#f57f17",
  "": "#757575",
};

const STATUS_COLORS: Record<string, string> = {
  done: "#2e7d32",
  in_progress: "#1565c0",
  todo: "#757575",
  cancelled: "#b71c1c",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(done: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((done / total) * 100);
}

function progressColor(p: number): "success" | "primary" | "warning" | "inherit" {
  if (p === 100) return "success";
  if (p >= 60) return "primary";
  if (p >= 30) return "warning";
  return "inherit";
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "done":       return <CheckCircleIcon sx={{ color: STATUS_COLORS.done, fontSize: 16 }} />;
    case "in_progress": return <PendingIcon sx={{ color: STATUS_COLORS.in_progress, fontSize: 16 }} />;
    case "cancelled":  return <CancelIcon sx={{ color: STATUS_COLORS.cancelled, fontSize: 16 }} />;
    default:           return <RadioButtonUncheckedIcon sx={{ color: STATUS_COLORS.todo, fontSize: 16 }} />;
  }
}

// ── Main component ────────────────────────────────────────────────────────────

const GapProgressReport: React.FC = () => {
  const { data: gapData, isLoading: gapLoading } = useGapAnalys();
  const { data: summary, isLoading: summaryLoading } = useGapTasksSummary();

  const isLoading = gapLoading || summaryLoading;

  const { domainStats, itemStats, totals } = useMemo(() => {
    if (!gapData || !summary) return { domainStats: [], itemStats: [], totals: null };

    const items = gapData.content.items;
    const byItem = summary.by_item;

    // Per-item stats
    const itemStats = items.map((item) => {
      const s: GapTaskItemSummary = byItem[item.id] ?? { total: 0, todo: 0, in_progress: 0, done: 0, cancelled: 0, weight_active: 0, weight_done: 0, weight_in_progress: 0, last_activity: null };
      const active = s.total - s.cancelled;
      // Progress is weighted by each task's omfattning, not a plain count.
      return { item, s, active, progress: pct(s.weight_done, s.weight_active) };
    });

    // Per-domain aggregates
    const domainStats = DOMAINS.map((domain) => {
      const dItems = itemStats.filter((x) => x.item.domain === domain);
      const taskTotal = dItems.reduce((acc, x) => acc + x.s.total, 0);
      const taskDone  = dItems.reduce((acc, x) => acc + x.s.done, 0);
      const taskActive = dItems.reduce((acc, x) => acc + x.active, 0);
      const withTasks = dItems.filter((x) => x.s.total > 0).length;
      const weightDone = dItems.reduce((acc, x) => acc + x.s.weight_done, 0);
      const weightActive = dItems.reduce((acc, x) => acc + x.s.weight_active, 0);
      return { domain, items: dItems.length, withTasks, taskTotal, taskDone, taskActive, progress: pct(weightDone, weightActive) };
    });

    // Global totals
    const taskTotal  = itemStats.reduce((a, x) => a + x.s.total, 0);
    const taskDone   = itemStats.reduce((a, x) => a + x.s.done, 0);
    const taskInProgress = itemStats.reduce((a, x) => a + x.s.in_progress, 0);
    const taskTodo   = itemStats.reduce((a, x) => a + x.s.todo, 0);
    const taskActive = itemStats.reduce((a, x) => a + x.active, 0);
    const weightDone = itemStats.reduce((a, x) => a + x.s.weight_done, 0);
    const weightActive = itemStats.reduce((a, x) => a + x.s.weight_active, 0);
    const totals = { taskTotal, taskDone, taskInProgress, taskTodo, taskActive, progress: pct(weightDone, weightActive), items: items.length };

    return { domainStats, itemStats, totals };
  }, [gapData, summary]);

  if (isLoading) {
    return <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}><CircularProgress /></Box>;
  }
  if (!gapData || !summary) {
    return (
      <Box sx={{ p: 3 }}><Alert severity="error">Kunde inte ladda data</Alert></Box>
    );
  }

  return (
    <Box sx={{ py: 4, px: { xs: 2, md: 3 }, maxWidth: 1100, mx: "auto" }}>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
        <ReportTitle fallback="GAP-analys – Uppgiftsprogress" />
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 4 }}>
        Realtidsläge för arbetet med att stänga gapen. Uppdateras automatiskt när uppgifter skapas och markeras som klara.
        Procenten viktas efter uppgifternas omfattning (liten 1, medel 2, stor 3).
      </Typography>

      {/* Summary cards */}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 4 }}>
        <SummaryCard label="GAP-poster" value={totals?.items ?? 0} sub="totalt" />
        <SummaryCard label="Uppgifter totalt" value={totals?.taskTotal ?? 0} sub={`${totals?.taskDone ?? 0} klara`} />
        <SummaryCard
          label="Övergripande progress"
          value={`${totals?.progress ?? 0}%`}
          sub={`${totals?.taskActive ?? 0} aktiva uppgifter`}
          highlight
        />
        <SummaryCard label="Pågående" value={totals?.taskInProgress ?? 0} sub="in progress" accent="#1565c0" />
        <SummaryCard label="Att göra" value={totals?.taskTodo ?? 0} sub="todo" accent="#757575" />
      </Stack>

      {/* Overall progress bar */}
      {(totals?.taskTotal ?? 0) > 0 && (
        <Box sx={{ mb: 4 }}>
          <Stack direction="row" sx={{ justifyContent: "space-between", mb: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Samlad uppgiftsprogress</Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>{totals?.taskDone}/{totals?.taskActive} klara</Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={totals?.progress ?? 0}
            color={progressColor(totals?.progress ?? 0)}
            sx={{ height: 10, borderRadius: 5 }}
          />
        </Box>
      )}

      <Divider sx={{ mb: 4 }} />

      {/* Domain breakdown */}
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Progress per domän</Typography>
      <Stack spacing={2} sx={{ mb: 5 }}>
        {domainStats.map((d) => (
          <Paper key={d.domain} variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}>
              <Typography sx={{ fontWeight: 600 }}>{d.domain}</Typography>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  {d.withTasks}/{d.items} poster med uppgifter
                </Typography>
                {d.taskTotal > 0 && (
                  <Chip
                    label={`${d.taskDone}/${d.taskActive} klara`}
                    size="small"
                    sx={{ bgcolor: d.progress === 100 ? "#e8f5e9" : "#e3f2fd", color: d.progress === 100 ? "#2e7d32" : "#1565c0", fontWeight: 600 }}
                  />
                )}
              </Stack>
            </Stack>
            {d.taskTotal > 0 ? (
              <LinearProgress
                variant="determinate"
                value={d.progress}
                color={progressColor(d.progress)}
                sx={{ height: 8, borderRadius: 4 }}
              />
            ) : (
              <Typography variant="caption" sx={{ color: "text.disabled", display: "block", textAlign: "center", py: 0.5 }}>
                Inga uppgifter knutna ännu
              </Typography>
            )}
          </Paper>
        ))}
      </Stack>

      <Divider sx={{ mb: 4 }} />

      {/* Item-level table */}
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Poster med uppgifter</Typography>
      {itemStats.filter((x) => x.s.total > 0).length === 0 ? (
        <Alert severity="info">Inga uppgifter har skapats ännu. Öppna GAP-analysen och lägg till uppgifter på enskilda gap-poster.</Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ "& th": { fontWeight: 700, bgcolor: "action.hover" } }}>
                <TableCell>GAP-objekt</TableCell>
                <TableCell width={130}>Domän</TableCell>
                <TableCell width={80}>Prio</TableCell>
                <TableCell width={160}>Progress</TableCell>
                <TableCell width={100} align="center">Uppgifter</TableCell>
                <TableCell width={130}>Senast aktiv</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {itemStats
                .filter((x) => x.s.total > 0)
                .sort((a, b) => a.progress - b.progress)
                .map(({ item, s, active, progress }) => (
                  <TableRow key={item.id} sx={{ "&:last-child td": { borderBottom: 0 } }}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{item.objekt}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>{item.domain}</Typography>
                    </TableCell>
                    <TableCell>
                      {item.prioritet && (
                        <Typography variant="caption" sx={{ fontWeight: 700, color: PRIORITET_COLOR[item.prioritet] }}>
                          {item.prioritet === "HOG" ? "HÖG" : item.prioritet}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <LinearProgress
                          variant="determinate"
                          value={progress}
                          color={progressColor(progress)}
                          sx={{ flex: 1, height: 6, borderRadius: 3 }}
                        />
                        <Typography variant="caption" sx={{ minWidth: 32, textAlign: "right" }}>{progress}%</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={0.5} sx={{ justifyContent: "center" }}>
                        {s.done > 0 && <StatusCount icon="done" count={s.done} />}
                        {s.in_progress > 0 && <StatusCount icon="in_progress" count={s.in_progress} />}
                        {s.todo > 0 && <StatusCount icon="todo" count={s.todo} />}
                        {s.cancelled > 0 && <StatusCount icon="cancelled" count={s.cancelled} />}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      {s.last_activity ? (
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          {new Date(s.last_activity).toLocaleDateString("sv-SE")}
                        </Typography>
                      ) : "—"}
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

// ── Small helpers ─────────────────────────────────────────────────────────────

const SummaryCard: React.FC<{
  label: string;
  value: string | number;
  sub: string;
  highlight?: boolean;
  accent?: string;
}> = ({ label, value, sub, highlight, accent }) => (
  <Paper
    variant="outlined"
    sx={{ flex: 1, p: 2, bgcolor: highlight ? "primary.50" : undefined, borderColor: highlight ? "primary.main" : undefined }}
  >
    <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
      {label}
    </Typography>
    <Typography variant="h4" sx={{ fontWeight: 700, color: accent ?? (highlight ? "primary.main" : "text.primary"), lineHeight: 1.2 }}>
      {value}
    </Typography>
    <Typography variant="caption" sx={{ color: "text.secondary" }}>{sub}</Typography>
  </Paper>
);

const StatusCount: React.FC<{ icon: string; count: number }> = ({ icon, count }) => (
  <Stack direction="row" spacing={0.25} sx={{ alignItems: "center" }}>
    <StatusIcon status={icon} />
    <Typography variant="caption" sx={{ color: STATUS_COLORS[icon], fontWeight: 600 }}>{count}</Typography>
  </Stack>
);

export default GapProgressReport;
