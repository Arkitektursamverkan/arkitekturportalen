import React, { useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  LinearProgress,
  Skeleton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import LoginOutlinedIcon from "@mui/icons-material/LoginOutlined";
import EventNoteIcon from "@mui/icons-material/EventNote";
import BarChartIcon from "@mui/icons-material/BarChart";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "@mui/material/styles";
import { type DailyActivity, type EntityTypeStat, useStatistics } from "@/api/statistics";

// ── Period selector ────────────────────────────────────────────────────────────

const PERIODS = [
  { value: 7,   label: "7d" },
  { value: 30,  label: "30d" },
  { value: 90,  label: "90d" },
  { value: 180, label: "180d" },
];

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({
  icon,
  label,
  value,
  color,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  loading: boolean;
}) {
  return (
    <Box
      sx={{
        flex: "1 1 140px",
        minWidth: 120,
        borderRadius: 2,
        p: 2,
        bgcolor: `${color}12`,
        border: "1px solid",
        borderColor: `${color}30`,
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
      }}
    >
      <Box sx={{ color, display: "flex", alignItems: "center", gap: 0.5 }}>
        {icon}
        <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 500 }}>
          {label}
        </Typography>
      </Box>
      {loading ? (
        <Skeleton width={48} height={32} />
      ) : (
        <Typography variant="h5" sx={{ fontWeight: 700, color }}>
          {value.toLocaleString("sv-SE")}
        </Typography>
      )}
    </Box>
  );
}

// ── Custom tooltip for recharts ────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ color: string; name: string; value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const dateStr = label
    ? new Date(label).toLocaleDateString("sv-SE", { day: "numeric", month: "short" })
    : label;
  return (
    <Box
      sx={{
        bgcolor: "background.paper",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1.5,
        p: 1.5,
        boxShadow: 3,
        minWidth: 140,
      }}
    >
      <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 0.5 }}>
        {dateStr}
      </Typography>
      {payload.map((entry) => (
        <Stack key={entry.name} direction="row" spacing={2} sx={{ justifyContent: "space-between" }}>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: entry.color }} />
            <Typography variant="caption">{entry.name}</Typography>
          </Stack>
          <Typography variant="caption" sx={{ fontWeight: 600 }}>
            {entry.value}
          </Typography>
        </Stack>
      ))}
    </Box>
  );
}

// ── Entity type breakdown bar ─────────────────────────────────────────────────

function EntityBar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <Box>
      <Stack direction="row" sx={{ justifyContent: "space-between", mb: 0.25 }}>
        <Typography variant="caption" sx={{ color: "text.primary", fontWeight: 500 }}>
          {label}
        </Typography>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {count}
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          height: 6,
          borderRadius: 3,
          bgcolor: "action.hover",
          "& .MuiLinearProgress-bar": { borderRadius: 3 },
        }}
      />
    </Box>
  );
}

// ── X-axis tick formatter ─────────────────────────────────────────────────────

function formatAxisDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        py: 6,
        gap: 1,
        color: "text.disabled",
      }}
    >
      <BarChartIcon sx={{ fontSize: 48 }} />
      <Typography variant="body2">Ingen aktivitetsdata ännu</Typography>
      <Typography variant="caption">
        Data visas allteftersom appen används
      </Typography>
    </Box>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const UsageStatistics: React.FC = () => {
  const theme = useTheme();
  const [period, setPeriod] = useState(30);
  const { data, isLoading, isError } = useStatistics(period);

  const CREATE_COLOR = theme.palette.success.main;
  const UPDATE_COLOR = theme.palette.info.main;
  const DELETE_COLOR = theme.palette.error.main;
  const LOGIN_COLOR  = theme.palette.warning.main;

  const maxEntity = data?.by_entity_type[0]?.count ?? 0;
  const hasData = (data?.activity_by_day.length ?? 0) > 0;

  // Downsample tick labels so they don't overlap (show at most ~6 ticks)
  const tickEvery = Math.max(1, Math.ceil((data?.activity_by_day.length ?? 0) / 6));
  const tickDates = data?.activity_by_day
    .filter((_: DailyActivity, i: number) => i % tickEvery === 0)
    .map((d: DailyActivity) => d.date) ?? [];

  return (
    <Stack spacing={2}>
      {/* Period picker */}
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <EventNoteIcon sx={{ color: "text.secondary", fontSize: 18 }} />
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Visar data för de senaste{" "}
            <strong>{period}</strong> dagarna
          </Typography>
        </Stack>
        <ToggleButtonGroup
          value={period}
          exclusive
          size="small"
          onChange={(_e, v) => v !== null && setPeriod(v)}
        >
          {PERIODS.map((p) => (
            <ToggleButton key={p.value} value={p.value} sx={{ px: 2, py: 0.5, fontSize: 12 }}>
              {p.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      {/* Metric cards */}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>
        <MetricCard
          icon={<BarChartIcon sx={{ fontSize: 16 }} />}
          label="Totalt"
          value={data?.total_events ?? 0}
          color={theme.palette.primary.main}
          loading={isLoading}
        />
        <MetricCard
          icon={<AddCircleOutlineIcon sx={{ fontSize: 16 }} />}
          label="Tillägg"
          value={data?.by_action.CREATE ?? 0}
          color={CREATE_COLOR}
          loading={isLoading}
        />
        <MetricCard
          icon={<EditOutlinedIcon sx={{ fontSize: 16 }} />}
          label="Uppdateringar"
          value={data?.by_action.UPDATE ?? 0}
          color={UPDATE_COLOR}
          loading={isLoading}
        />
        <MetricCard
          icon={<DeleteOutlineIcon sx={{ fontSize: 16 }} />}
          label="Borttagningar"
          value={data?.by_action.DELETE ?? 0}
          color={DELETE_COLOR}
          loading={isLoading}
        />
        <MetricCard
          icon={<LoginOutlinedIcon sx={{ fontSize: 16 }} />}
          label="Inloggningar"
          value={data?.by_action.LOGIN ?? 0}
          color={LOGIN_COLOR}
          loading={isLoading}
        />
      </Box>

      {/* Activity chart */}
      <Box>
        <Typography variant="subtitle2" sx={{ color: "text.secondary", mb: 1.5 }}>
          Aktivitet över tid
        </Typography>

        {isError && (
          <Typography variant="body2" color="error">
            Kunde inte hämta statistik.
          </Typography>
        )}

        {isLoading && (
          <Box sx={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CircularProgress size={32} />
          </Box>
        )}

        {!isLoading && !isError && !hasData && <EmptyState />}

        {!isLoading && !isError && hasData && (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart
                data={data?.activity_by_day}
                margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="grad-create" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CREATE_COLOR} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={CREATE_COLOR} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="grad-update" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={UPDATE_COLOR} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={UPDATE_COLOR} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="grad-delete" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={DELETE_COLOR} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={DELETE_COLOR} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
                <XAxis
                  dataKey="date"
                  ticks={tickDates}
                  tickFormatter={formatAxisDate}
                  tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                  axisLine={false}
                  tickLine={false}
                />
                <RechartsTooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="create"
                  name="Tillägg"
                  stroke={CREATE_COLOR}
                  strokeWidth={2}
                  fill="url(#grad-create)"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Area
                  type="monotone"
                  dataKey="update"
                  name="Uppdateringar"
                  stroke={UPDATE_COLOR}
                  strokeWidth={2}
                  fill="url(#grad-update)"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Area
                  type="monotone"
                  dataKey="delete"
                  name="Borttagningar"
                  stroke={DELETE_COLOR}
                  strokeWidth={2}
                  fill="url(#grad-delete)"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>

            {/* Legend */}
            <Stack direction="row" spacing={2} sx={{ justifyContent: "center", mt: 0.5 }}>
              {[
                { color: CREATE_COLOR, label: "Tillägg" },
                { color: UPDATE_COLOR, label: "Uppdateringar" },
                { color: DELETE_COLOR, label: "Borttagningar" },
              ].map(({ color, label }) => (
                <Stack key={label} direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                  <Box sx={{ width: 12, height: 3, bgcolor: color, borderRadius: 1 }} />
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    {label}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </>
        )}
      </Box>

      {/* Entity type breakdown */}
      {!isLoading && !isError && (data?.by_entity_type.length ?? 0) > 0 && (
        <Box>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="subtitle2" sx={{ color: "text.secondary", mb: 1.5 }}>
            Mest ändrade typer
          </Typography>
          <Stack spacing={1.5}>
            {data!.by_entity_type.map((et: EntityTypeStat) => (
              <EntityBar key={et.label} label={et.label} count={et.count} max={maxEntity} />
            ))}
          </Stack>
        </Box>
      )}

      {/* Footer chip */}
      {!isLoading && data && (
        <Box>
          <Chip
            size="small"
            label={`${data.active_days} aktiva dagar av ${period}`}
            variant="outlined"
            sx={{ fontSize: 11 }}
          />
        </Box>
      )}
    </Stack>
  );
};

export default UsageStatistics;
