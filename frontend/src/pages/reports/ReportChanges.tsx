import React, { useMemo, useState } from "react";
import {
  Alert, Autocomplete, Box, Button, Chip, LinearProgress, MenuItem, Paper, Stack, Tab, Table, TableBody,
  TableCell, TableContainer, TableHead, TablePagination, TableRow, TableSortLabel, Tabs, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DownloadIcon from "@mui/icons-material/Download";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer,
  Tooltip as ChartTooltip, XAxis, YAxis,
} from "recharts";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useChangeStatistics, type ChangeEvent, type ChangeKind } from "@/api/changeStatistics";
import ReportTitle from "@/components/reports/ReportTitle";
import {
  ALL_TYPES, GRAIN_LABEL, KIND_LABEL, KINDS, LAYERS, addDays, autoGrain, countKinds, csvCell, isoDate,
  kindColor, layerColor, layerLabel, layerOf, perBucket, perField, perObject, perType, startOfDay,
  stockPerBucket, typeColor, type Grain, type LayerKey, type Mode, type ObjectRow, type SplitBy,
} from "@/utils/changeStats";

const TYPE_ROUTES: Record<string, string> = {
  Application: "/systems",
  Process: "/processes",
  InformationObject: "/info-objects",
  InformationSource: "/info-sources",
  TechnologyComponent: "/tech-components",
  Server: "/servers",
  ServerService: "/server-services",
};

const KIND_ONE: Record<ChangeKind, string> = { added: "Tillagd", updated: "Uppdaterad", removed: "Borttagen" };

const FIELD_LABEL: Record<string, string> = {
  name: "Namn",
  description: "Beskrivning",
  external_source: "Källa",
  external_id: "Externt id",
};

// Before any change was recorded: "Allt" asks for everything since then.
const BEGINNING = new Date(2000, 0, 1);

type Preset = "30" | "90" | "365" | "year" | "all";
const PRESETS: { key: Preset; label: string }[] = [
  { key: "30", label: "30 dagar" },
  { key: "90", label: "90 dagar" },
  { key: "365", label: "12 månader" },
  { key: "year", label: "I år" },
  { key: "all", label: "Allt" },
];

interface Period {
  from: Date; // inclusive, local midnight
  to: Date; // exclusive, local midnight
}

function presetPeriod(p: Preset): Period {
  const tomorrow = addDays(startOfDay(new Date()), 1);
  if (p === "all") return { from: BEGINNING, to: tomorrow };
  if (p === "year") return { from: new Date(new Date().getFullYear(), 0, 1), to: tomorrow };
  return { from: addDays(tomorrow, -Number(p)), to: tomorrow };
}

const nf = new Intl.NumberFormat("sv-SE");
const dtf = new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "short" });

// ── Small pieces ─────────────────────────────────────────────────────────────

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, flex: "1 1 150px", minWidth: 150 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography sx={{ fontSize: 28, fontWeight: 600, lineHeight: 1.3 }}>{value}</Typography>
      {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
    </Paper>
  );
}

function ChartCard({ title, subtitle, children, action }: {
  title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }}>
      <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: "flex-start", justifyContent: "space-between" }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{title}</Typography>
          {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
        </Box>
        {action}
      </Stack>
      {children}
    </Paper>
  );
}

/** Values first, names after, each keyed by a short stroke of its colour. */
function ValueTooltip({ active, payload, label, names, hint }: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number; color?: string }[];
  label?: string;
  names: (key: string) => string;
  hint?: string;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => (p.value ?? 0) !== 0 || payload.length <= 4);
  return (
    <Paper elevation={3} sx={{ px: 1.5, py: 1, minWidth: 140 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      {rows.map((p) => (
        <Stack key={String(p.dataKey)} direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Box sx={{ width: 12, height: 2, bgcolor: p.color, borderRadius: 1 }} />
          <Typography variant="body2" sx={{ fontWeight: 700 }}>{nf.format(p.value ?? 0)}</Typography>
          <Typography variant="body2" color="text.secondary">{names(String(p.dataKey))}</Typography>
        </Stack>
      ))}
      {hint && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>{hint}</Typography>}
    </Paper>
  );
}

type SortDir = "asc" | "desc";

function sortRows<T>(rows: T[], key: keyof T, dir: SortDir): T[] {
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    const c = typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av ?? "").localeCompare(String(bv ?? ""), "sv");
    return dir === "asc" ? c : -c;
  });
}

function download(name: string, lines: string[]) {
  // A BOM so Excel reads the Swedish characters right.
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// ── The report ───────────────────────────────────────────────────────────────

const ReportChanges: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const theme = useTheme();
  const mode: Mode = theme.palette.mode === "dark" ? "dark" : "light";
  const surface = theme.palette.background.paper;
  const muted = theme.palette.text.secondary;
  const grid = theme.palette.divider;

  // Filters – every chart, figure and table below follows them.
  const [preset, setPreset] = useState<Preset | null>("90");
  const [period, setPeriod] = useState<Period>(() => presetPeriod("90"));
  const [back, setBack] = useState<{ period: Period; preset: Preset | null }[]>([]);
  const [types, setTypes] = useState<string[]>(ALL_TYPES);
  const [kinds, setKinds] = useState<ChangeKind[]>(KINDS);
  const [who, setWho] = useState<"all" | "people" | "sync">("all");
  const [source, setSource] = useState<string>("all");
  const [field, setField] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [grainChoice, setGrainChoice] = useState<Grain | "auto">("auto");
  const [split, setSplit] = useState<SplitBy>("kind");
  const [tab, setTab] = useState<"objects" | "events">("objects");

  const { data, isFetching, isError } = useChangeStatistics(period.from, period.to, types);

  const typeName = (type: string) => t(`nodeTypes.${type}`, { defaultValue: type });
  const fieldName = (f: string) => FIELD_LABEL[f] ?? t(`attributes.${f}`, { defaultValue: f });
  const sourceName = (s: string) => (s === "NONE" ? "Portalen" : t(`externalSource.${s}`, { defaultValue: s }));

  // Where the charts start: not before the oldest change on record.
  const shownFrom = useMemo(() => {
    const h = data?.history_from ? startOfDay(new Date(data.history_from)) : null;
    return h && h > period.from ? h : period.from;
  }, [data?.history_from, period.from]);
  const grain: Grain = grainChoice === "auto" ? autoGrain(shownFrom, period.to) : grainChoice;

  const allEvents = useMemo(() => data?.events ?? [], [data]);
  const sources = useMemo(() => [...new Set(allEvents.map((e) => e.source))].sort(), [allEvents]);
  const showsWho = allEvents.some((e) => e.by !== null);

  const events = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allEvents.filter((e) =>
      kinds.includes(e.kind)
      && (who === "all" || (who === "sync") === e.by_sync)
      && (source === "all" || e.source === source)
      && (!field || e.fields.includes(field))
      && (!q || (e.name ?? "").toLowerCase().includes(q)),
    );
  }, [allEvents, kinds, who, source, field, search]);

  const seriesKeys: string[] = split === "kind" ? KINDS : split === "layer"
    ? LAYERS.filter((l) => l.types.some((x) => types.includes(x))).map((l) => l.key)
    : ALL_TYPES.filter((x) => types.includes(x));
  const seriesName = (k: string) => split === "kind" ? KIND_LABEL[k as ChangeKind]
    : split === "layer" ? layerLabel(k as LayerKey) : k === "total" ? "Antal objekt" : typeName(k);
  const seriesColor = (k: string) => split === "kind" ? kindColor(k as ChangeKind, mode)
    : split === "layer" ? layerColor(k as LayerKey, mode) : typeColor(k, mode);

  const rows = useMemo(
    () => perBucket(events, shownFrom, period.to, grain, split, seriesKeys),
    // seriesKeys follows split and types
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, shownFrom, period.to, grain, split, types],
  );
  // Object counts follow the objects, not the change filters: every event of the chosen types.
  const stock = useMemo(
    () => (data ? stockPerBucket(allEvents, data.count_at_end, rows, grain, split, seriesKeys) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allEvents, data, rows, grain, split, types],
  );
  const stockKeys = split === "kind" ? ["total"] : seriesKeys;
  const stockColor = (k: string) => (k === "total" ? kindColor("updated", mode) : seriesColor(k));

  const totals = countKinds(events);
  const atEnd = data ? Object.values(data.count_at_end).reduce((a, b) => a + b, 0) : 0;
  const byType = useMemo(() => perType(events), [events]);
  const byField = useMemo(() => perField(events).slice(0, 12), [events]);
  const objects = useMemo(() => perObject(events), [events]);

  // ── Drilling ───────────────────────────────────────────────────────────────

  const choosePeriod = (p: Period, pr: Preset | null) => {
    setBack((b) => [...b, { period, preset }]);
    setPeriod(p);
    setPreset(pr);
  };
  const goBack = () => {
    const last = back[back.length - 1];
    if (!last) return;
    setBack(back.slice(0, -1));
    setPeriod(last.period);
    setPreset(last.preset);
  };
  const drillBucket = (index: number) => {
    const r = rows[index];
    if (r && grain !== "day") choosePeriod({ from: r.from, to: r.to }, null);
  };
  const toggleLayer = (types0: string[]) => {
    const all = types0.every((x) => types.includes(x));
    const next = all ? types.filter((x) => !types0.includes(x)) : [...new Set([...types, ...types0])];
    setTypes(next.length ? ALL_TYPES.filter((x) => next.includes(x)) : ALL_TYPES);
  };

  // ── Tables ─────────────────────────────────────────────────────────────────

  const [objSort, setObjSort] = useState<{ key: keyof ObjectRow; dir: SortDir }>({ key: "last", dir: "desc" });
  const [evSort, setEvSort] = useState<{ key: keyof ChangeEvent; dir: SortDir }>({ key: "at", dir: "desc" });
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const sortedObjects = useMemo(() => sortRows(objects, objSort.key, objSort.dir), [objects, objSort]);
  const sortedEvents = useMemo(() => sortRows(events, evSort.key, evSort.dir), [events, evSort]);
  const tableRows = tab === "objects" ? sortedObjects : sortedEvents;
  const pageRows = tableRows.slice(page * perPage, page * perPage + perPage);

  const objHead = (key: keyof ObjectRow, label: string, numeric = false) => (
    <TableCell align={numeric ? "right" : "left"} sortDirection={objSort.key === key ? objSort.dir : false}>
      <TableSortLabel active={objSort.key === key} direction={objSort.key === key ? objSort.dir : "asc"}
        onClick={() => setObjSort({ key, dir: objSort.key === key && objSort.dir === "desc" ? "asc" : "desc" })}>
        {label}
      </TableSortLabel>
    </TableCell>
  );
  const evHead = (key: keyof ChangeEvent, label: string) => (
    <TableCell sortDirection={evSort.key === key ? evSort.dir : false}>
      <TableSortLabel active={evSort.key === key} direction={evSort.key === key ? evSort.dir : "asc"}
        onClick={() => setEvSort({ key, dir: evSort.key === key && evSort.dir === "desc" ? "asc" : "desc" })}>
        {label}
      </TableSortLabel>
    </TableCell>
  );
  const whoText = (e: ChangeEvent) => e.by ?? (e.by_sync ? "Synkronisering" : "Person");
  const openObject = (type: string, id: string) => navigate(`${TYPE_ROUTES[type]}?id=${id}`);

  const exportCsv = () => {
    const stamp = `${isoDate(shownFrom)}_${isoDate(addDays(period.to, -1))}`;
    if (tab === "objects") {
      download(`forandringar-objekt-${stamp}.csv`, [
        ["Objekt", "Typ", "Lager", "Tillagda", "Uppdaterade", "Borttagna", "Senast", "Borttaget nu"].map(csvCell).join(";"),
        ...sortedObjects.map((o) => [o.name, typeName(o.type), layerLabel(o.layer), o.added, o.updated, o.removed,
          dtf.format(new Date(o.last)), o.gone ? "ja" : "nej"].map(csvCell).join(";")),
      ]);
    } else {
      download(`forandringar-handelser-${stamp}.csv`, [
        ["Tidpunkt", "Händelse", "Objekt", "Typ", "Lager", "Ändrade fält", "Källa", "Gjord av"].map(csvCell).join(";"),
        ...sortedEvents.map((e) => [dtf.format(new Date(e.at)), KIND_LABEL[e.kind], e.name, typeName(e.type),
          layerLabel(layerOf(e.type)), e.fields.map(fieldName).join(", "), sourceName(e.source), whoText(e)].map(csvCell).join(";")),
      ]);
    }
  };

  const axisTick = { fill: muted, fontSize: 12 };
  const lastSeries = seriesKeys[seriesKeys.length - 1];
  const periodText = `${isoDate(shownFrom)} – ${isoDate(addDays(period.to, -1))}`;
  const activeFilters = [
    field && { label: `Fält: ${fieldName(field)}`, clear: () => setField(null) },
    search && { label: `Sök: ${search}`, clear: () => setSearch("") },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  return (
    <Box sx={{ p: 3, maxWidth: 1400 }}>
      <Typography variant="h5" sx={{ fontWeight: 600 }}>
        <ReportTitle fallback={t("nav.reportChanges", "Förändringsstatistik")} />
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Tillagda, uppdaterade och borttagna objekt per BDAT-lager och objekttyp. Klicka i graferna för att borra
        ned: en stapel öppnar perioden, en objekttyp eller ett fält filtrerar allt på sidan.
      </Typography>

      {/* ── Filters: one row, above everything they scope ── */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={1.5} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <ToggleButtonGroup size="small" exclusive value={preset}
            onChange={(_, v: Preset | null) => v && choosePeriod(presetPeriod(v), v)}>
            {PRESETS.map((p) => <ToggleButton key={p.key} value={p.key}>{p.label}</ToggleButton>)}
          </ToggleButtonGroup>
          <TextField size="small" type="date" label="Från" sx={{ width: 160 }} slotProps={{ inputLabel: { shrink: true } }}
            value={isoDate(shownFrom)}
            onChange={(e) => {
              const d = e.target.value ? new Date(`${e.target.value}T00:00`) : null;
              if (d && d < period.to) choosePeriod({ from: d, to: period.to }, null);
            }} />
          <TextField size="small" type="date" label="Till och med" sx={{ width: 160 }} slotProps={{ inputLabel: { shrink: true } }}
            value={isoDate(addDays(period.to, -1))}
            onChange={(e) => {
              const d = e.target.value ? addDays(new Date(`${e.target.value}T00:00`), 1) : null;
              if (d && d > period.from) choosePeriod({ from: period.from, to: d }, null);
            }} />
          {back.length > 0 && (
            <Button size="small" startIcon={<ArrowBackIcon />} onClick={goBack}>Tillbaka</Button>
          )}
        </Stack>

        <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1.5, alignItems: "center", flexWrap: "wrap" }}>
          <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>BDAT</Typography>
          {LAYERS.map((l) => {
            const on = l.types.every((x) => types.includes(x));
            const part = !on && l.types.some((x) => types.includes(x));
            return (
              <Chip key={l.key} label={l.label} size="small" onClick={() => toggleLayer(l.types)}
                color={on ? "primary" : "default"} variant={on ? "filled" : part ? "outlined" : "outlined"}
                sx={part ? { borderStyle: "dashed" } : undefined} />
            );
          })}
          <Autocomplete multiple size="small" disableCloseOnSelect sx={{ minWidth: 300, flex: "1 1 300px" }}
            options={ALL_TYPES} value={types}
            groupBy={(o) => layerLabel(layerOf(o))}
            getOptionLabel={typeName}
            onChange={(_, v) => setTypes(v.length ? ALL_TYPES.filter((x) => v.includes(x)) : ALL_TYPES)}
            renderInput={(p) => <TextField {...p} label="Objekttyper" />}
            slotProps={{ chip: { size: "small" } }} />
        </Stack>

        <Stack direction="row" spacing={1.5} useFlexGap sx={{ mt: 1.5, alignItems: "center", flexWrap: "wrap" }}>
          <ToggleButtonGroup size="small" value={kinds}
            onChange={(_, v: ChangeKind[]) => setKinds(v.length ? KINDS.filter((k) => v.includes(k)) : KINDS)}>
            {KINDS.map((k) => (
              <ToggleButton key={k} value={k} sx={{ gap: 0.75 }}>
                <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: kindColor(k, mode) }} />
                {KIND_LABEL[k]}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <TextField select size="small" label="Gjord av" value={who} sx={{ width: 170 }}
            onChange={(e) => setWho(e.target.value as typeof who)}>
            <MenuItem value="all">Alla</MenuItem>
            <MenuItem value="people">Personer</MenuItem>
            <MenuItem value="sync">Synkronisering</MenuItem>
          </TextField>
          <TextField select size="small" label="Källa" value={source} sx={{ width: 170 }}
            onChange={(e) => setSource(e.target.value)}>
            <MenuItem value="all">Alla</MenuItem>
            {sources.map((s) => <MenuItem key={s} value={s}>{sourceName(s)}</MenuItem>)}
          </TextField>
          <TextField size="small" label="Sök objekt" value={search} sx={{ width: 200 }}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          {activeFilters.map((f) => <Chip key={f.label} label={f.label} size="small" onDelete={f.clear} />)}
        </Stack>
      </Paper>

      {isError && <Alert severity="error" sx={{ mb: 2 }}>Statistiken gick inte att hämta.</Alert>}
      {data?.truncated && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Perioden har fler ändringar än som kan visas på en gång – bara de första {nf.format(data.events.length)} räknas.
          Välj en kortare period eller färre objekttyper.
        </Alert>
      )}
      {data?.history_from && new Date(data.history_from) > period.from && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Historiken börjar {isoDate(new Date(data.history_from))}: ändringar före dess finns inte registrerade.
        </Alert>
      )}
      <Box sx={{ height: 4, mb: 1 }}>{isFetching && <LinearProgress />}</Box>

      {/* While new data loads the old stays, dimmed – no jump, no flash.
          A clicked chart keeps no focus ring; the keyboard still gets one. */}
      <Box sx={{
        opacity: isFetching ? 0.5 : 1, transition: "opacity 150ms",
        "& .recharts-wrapper *:focus:not(:focus-visible)": { outline: "none" },
      }}>
        <Stack direction="row" spacing={1.5} useFlexGap sx={{ mb: 2, flexWrap: "wrap" }}>
          <StatTile label="Tillagda" value={nf.format(totals.added)} />
          <StatTile label="Uppdaterade" value={nf.format(totals.updated)} />
          <StatTile label="Borttagna" value={nf.format(totals.removed)} />
          <StatTile label="Nettoförändring" value={(totals.added - totals.removed > 0 ? "+" : "") + nf.format(totals.added - totals.removed)} />
          <StatTile label="Objekt vid periodens slut" value={nf.format(atEnd)} hint={periodText} />
        </Stack>

        <ChartCard
          title="Förändringar över tid"
          subtitle={grain === "day" ? periodText : `${periodText} · klicka på en stapel för att öppna perioden`}
          action={
            <Stack direction="row" spacing={1}>
              <TextField select size="small" label="Dela upp efter" value={split} sx={{ width: 150 }}
                onChange={(e) => setSplit(e.target.value as SplitBy)}>
                <MenuItem value="kind">Händelse</MenuItem>
                <MenuItem value="layer">BDAT-lager</MenuItem>
                <MenuItem value="type">Objekttyp</MenuItem>
              </TextField>
              <TextField select size="small" label="Intervall" value={grainChoice} sx={{ width: 150 }}
                onChange={(e) => setGrainChoice(e.target.value as Grain | "auto")}>
                <MenuItem value="auto">Auto ({GRAIN_LABEL[autoGrain(shownFrom, period.to)].toLowerCase()})</MenuItem>
                {(Object.keys(GRAIN_LABEL) as Grain[]).map((g) => <MenuItem key={g} value={g}>{GRAIN_LABEL[g]}</MenuItem>)}
              </TextField>
            </Stack>
          }
        >
          <Box sx={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                <CartesianGrid vertical={false} stroke={grid} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: grid }} minTickGap={16} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                <ChartTooltip cursor={{ fill: theme.palette.action.hover }}
                  content={<ValueTooltip names={seriesName} hint={grain !== "day" ? "Klicka för att öppna perioden" : undefined} />} />
                <Legend itemSorter={null} formatter={(v: string) => <span style={{ color: theme.palette.text.primary }}>{seriesName(v)}</span>} />
                {seriesKeys.map((k) => (
                  <Bar key={k} dataKey={k} stackId="a" fill={seriesColor(k)} stroke={surface} strokeWidth={2}
                    maxBarSize={24} radius={k === lastSeries ? [4, 4, 0, 0] : 0}
                    cursor={grain !== "day" ? "pointer" : undefined}
                    onClick={(_, i) => drillBucket(i)} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </ChartCard>

        <Box sx={{ mt: 2 }}>
          <ChartCard title="Antal objekt över tid"
            subtitle={`Vid slutet av varje ${GRAIN_LABEL[grain].toLowerCase()}, räknat bakåt från dagens antal`}>
            <Box sx={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stock} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                  <CartesianGrid vertical={false} stroke={grid} />
                  <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: grid }} minTickGap={16} />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} domain={["auto", "auto"]} />
                  <ChartTooltip cursor={{ stroke: muted, strokeWidth: 1 }} content={<ValueTooltip names={seriesName} />} />
                  {stockKeys.length > 1 && (
                    <Legend itemSorter={null} formatter={(v: string) => <span style={{ color: theme.palette.text.primary }}>{seriesName(v)}</span>} />
                  )}
                  {stockKeys.map((k) => (
                    <Line key={k} dataKey={k} type="monotone" stroke={stockColor(k)} strokeWidth={2} dot={false}
                      activeDot={{ r: 4, stroke: surface, strokeWidth: 2 }} isAnimationActive={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </Box>
          </ChartCard>
        </Box>

        <Box sx={{ mt: 2, display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
          <ChartCard title="Per objekttyp" subtitle="Klicka på en typ för att bara visa den">
            <Box sx={{ height: Math.max(160, byType.length * 40 + 60) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={byType.map((r) => ({ ...r, label: typeName(r.type) }))}
                  margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
                  <CartesianGrid horizontal={false} stroke={grid} />
                  <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" tick={axisTick} tickLine={false} axisLine={false} width={130} />
                  <ChartTooltip cursor={{ fill: theme.palette.action.hover }}
                    content={<ValueTooltip names={(k) => KIND_LABEL[k as ChangeKind]} hint="Klicka för att bara visa typen" />} />
                  <Legend itemSorter={null} formatter={(v: string) => <span style={{ color: theme.palette.text.primary }}>{KIND_LABEL[v as ChangeKind]}</span>} />
                  {KINDS.filter((k) => kinds.includes(k)).map((k, i, arr) => (
                    <Bar key={k} dataKey={k} stackId="t" fill={kindColor(k, mode)} stroke={surface} strokeWidth={2}
                      maxBarSize={24} radius={i === arr.length - 1 ? [0, 4, 4, 0] : 0} cursor="pointer"
                      onClick={(_, idx) => { const tp = byType[idx]?.type; if (tp) setTypes([tp]); }}
                      isAnimationActive={false} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </ChartCard>

          <ChartCard title="Vanligast ändrade fält" subtitle="Bland uppdateringarna · klicka för att filtrera på fältet">
            {byField.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
                Inga uppdateringar i urvalet.
              </Typography>
            ) : (
              <Box sx={{ height: Math.max(160, byField.length * 32 + 30) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={byField.map((r) => ({ ...r, label: fieldName(r.field) }))}
                    margin={{ top: 0, right: 40, bottom: 0, left: 8 }}>
                    <CartesianGrid horizontal={false} stroke={grid} />
                    <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="label" tick={axisTick} tickLine={false} axisLine={false} width={150} />
                    <ChartTooltip cursor={{ fill: theme.palette.action.hover }}
                      content={<ValueTooltip names={() => "uppdateringar"} hint="Klicka för att filtrera på fältet" />} />
                    <Bar dataKey="count" fill={kindColor("updated", mode)} maxBarSize={24} radius={[0, 4, 4, 0]} cursor="pointer"
                      label={{ position: "right", fill: muted, fontSize: 12 }}
                      onClick={(_, idx) => { const f = byField[idx]?.field; if (f) setField(f); }}
                      isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            )}
          </ChartCard>
        </Box>

        {/* ── The data itself: every value in the charts is here too ── */}
        <Paper variant="outlined" sx={{ mt: 2 }}>
          <Stack direction="row" sx={{ px: 2, pt: 1, alignItems: "center", justifyContent: "space-between" }}>
            <Tabs value={tab} onChange={(_, v) => { setTab(v); setPage(0); }}>
              <Tab value="objects" label={`Objekt (${nf.format(objects.length)})`} />
              <Tab value="events" label={`Händelser (${nf.format(events.length)})`} />
            </Tabs>
            <Button size="small" startIcon={<DownloadIcon />} onClick={exportCsv} disabled={!tableRows.length}>
              Exportera CSV
            </Button>
          </Stack>
          <TableContainer>
            <Table size="small">
              <TableHead>
                {tab === "objects" ? (
                  <TableRow>
                    {objHead("name", "Objekt")}
                    {objHead("type", "Typ")}
                    {objHead("layer", "Lager")}
                    {objHead("added", "Tillagda", true)}
                    {objHead("updated", "Uppdaterade", true)}
                    {objHead("removed", "Borttagna", true)}
                    {objHead("last", "Senast")}
                  </TableRow>
                ) : (
                  <TableRow>
                    {evHead("at", "Tidpunkt")}
                    {evHead("kind", "Händelse")}
                    {evHead("name", "Objekt")}
                    {evHead("type", "Typ")}
                    <TableCell>Ändrade fält</TableCell>
                    {evHead("source", "Källa")}
                    <TableCell>{showsWho ? "Gjord av" : "Av"}</TableCell>
                  </TableRow>
                )}
              </TableHead>
              <TableBody>
                {tab === "objects"
                  ? (pageRows as ObjectRow[]).map((o) => (
                    <TableRow key={o.node_id} hover>
                      <TableCell>
                        {o.gone ? (
                          <Tooltip title="Objektet är borttaget"><span>{o.name || "–"} <Chip size="small" label="borttaget" sx={{ ml: 0.5 }} /></span></Tooltip>
                        ) : (
                          <Box component="span" sx={{ cursor: "pointer", color: "primary.main", "&:hover": { textDecoration: "underline" } }}
                            onClick={() => openObject(o.type, o.node_id)}>{o.name || "–"}</Box>
                        )}
                      </TableCell>
                      <TableCell>{typeName(o.type)}</TableCell>
                      <TableCell>{layerLabel(o.layer)}</TableCell>
                      <TableCell align="right">{o.added || ""}</TableCell>
                      <TableCell align="right">{o.updated || ""}</TableCell>
                      <TableCell align="right">{o.removed || ""}</TableCell>
                      <TableCell>{dtf.format(new Date(o.last))}</TableCell>
                    </TableRow>
                  ))
                  : (pageRows as ChangeEvent[]).map((e, i) => (
                    <TableRow key={`${e.node_id}-${e.at}-${i}`} hover>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>{dtf.format(new Date(e.at))}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: kindColor(e.kind, mode) }} />
                          <span>{KIND_ONE[e.kind]}</span>
                        </Stack>
                      </TableCell>
                      <TableCell>{e.name ?? "–"}</TableCell>
                      <TableCell>{typeName(e.type)}</TableCell>
                      <TableCell sx={{ maxWidth: 280 }}>{e.fields.map(fieldName).join(", ")}</TableCell>
                      <TableCell>{sourceName(e.source)}</TableCell>
                      <TableCell>{whoText(e)}</TableCell>
                    </TableRow>
                  ))}
                {!tableRows.length && (
                  <TableRow>
                    <TableCell colSpan={7} sx={{ textAlign: "center", color: "text.secondary", py: 4 }}>
                      {data ? "Inga ändringar i urvalet." : "Hämtar …"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination component="div" count={tableRows.length} page={page} rowsPerPage={perPage}
            rowsPerPageOptions={[25, 50, 100]} labelRowsPerPage="Rader per sida"
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} av ${count}`}
            onPageChange={(_, p) => setPage(p)}
            onRowsPerPageChange={(e) => { setPerPage(Number(e.target.value)); setPage(0); }} />
        </Paper>
      </Box>
    </Box>
  );
};

export default ReportChanges;
