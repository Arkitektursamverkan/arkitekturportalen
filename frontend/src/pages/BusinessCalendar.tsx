import React, { useMemo, useState } from "react";
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Paper, Stack,
  Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton,
  ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import BuildIcon from "@mui/icons-material/Build";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import AddIcon from "@mui/icons-material/Add";
import BlockIcon from "@mui/icons-material/Block";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import LockIcon from "@mui/icons-material/Lock";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  addDays, CALENDAR_NODE_ROUTES, compactDate, daysBetween, fromIsoDate, MAX_DURATION_DAYS, monthName,
  occurrenceEnd, RECURRENCES, recurrenceLabel, shortDate, spanLabel,
  timeLabel, toIsoDate, useCalendarEvents, useCreateCalendarEvent, useDeleteCalendarEvent,
  useResolveCalendarEvent, useUpdateCalendarEvent,
  type CalendarEvent, type CalendarEventInput, type CalendarEventNode,
} from "@/api/calendar";
import {
  AFFECTED_SHARE_LABELS, APPROVAL_STATUS_LABELS, CHANGE_TYPE_LABELS, USER_IMPACT_LABELS,
  changeWhenLabel, useChangeEntries, useChangeLogPermissions, type ChangeEntry,
} from "@/api/changeLog";
import ChangeEntryDialog from "@/components/calendar/ChangeEntryDialog";
import { useDepartments } from "@/api/directory";
import { useNodes } from "@/api/nodes";
import { NODE_COLORS } from "@/config/graphConfig";
import { useRoleStore } from "@/store/roleStore";

const FREEZE_COLOR = "#C62828";
const EVENT_COLOR = "#2E7D32";
const CHANGE_COLOR = "#1565C0";
const WEEKDAY_HEADERS = ["Mån", "Tis", "Ons", "Tors", "Fre", "Lör", "Sön"];
/** Hur långt fram listan "Kommande" ser. */
const UPCOMING_DAYS = 30;

type View = "month" | "upcoming" | "changes";

interface Occurrence {
  /** Dagen raden visas på. */
  date: string;
  /** Dagen tillfället börjar – en tidigare dag för en flerdagshändelse som pågår. */
  start: string;
  event: CalendarEvent;
}

const eventColor = (e: CalendarEvent) => (e.change_freeze ? FREEZE_COLOR : EVENT_COLOR);

const nodeColor = (type: string) => (NODE_COLORS as Record<string, string>)[type] ?? "#999";

/** ISO-veckonummer. */
const weekNumber = (d: Date): number => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7);
};

/** Måndagen i veckan som datumet ligger i. */
const mondayOf = (d: Date): Date => addDays(d, -((d.getDay() + 6) % 7));

const byTime = (a: Occurrence, b: Occurrence): number =>
  a.date.localeCompare(b.date) ||
  (a.event.start_time ?? "").localeCompare(b.event.start_time ?? "") ||
  a.event.title.localeCompare(b.event.title, "sv");

const errorText = (err: unknown, fallback: string): string => {
  const msg = (err as Error | null)?.message;
  return typeof msg === "string" && msg ? msg : fallback;
};

const BusinessCalendar: React.FC = () => {
  const { t } = useTranslation();
  const { isEditor, id: userId } = useRoleStore();
  const today = useMemo(() => new Date(), []);
  const todayIso = toIsoDate(today);

  const [view, setView] = useState<View>("month");
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  // ?id= öppnar en post direkt – länken från objektsidor och startsidan.
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("id"));
  // null = stängd; { event: null } = ny post.
  const [editing, setEditing] = useState<{ event: CalendarEvent | null; date: string } | null>(null);
  // Förändringsloggen: null = stängd; { entry: null } = ny post.
  const [changeOpen, setChangeOpen] = useState<{ entry: ChangeEntry | null } | null>(null);
  const canManageChanges = useChangeLogPermissions().data?.can_manage ?? false;

  // Månadsvyn visar hela veckor, så perioden börjar på en måndag.
  const gridStart = mondayOf(month);
  const weeks = Math.ceil(
    (Math.round((new Date(month.getFullYear(), month.getMonth() + 1, 0).getTime() - gridStart.getTime()) / 86_400_000) + 1) / 7,
  );
  const from = view === "month" ? toIsoDate(gridStart) : todayIso;
  const to = view === "month" ? toIsoDate(addDays(gridStart, weeks * 7 - 1)) : toIsoDate(addDays(today, UPCOMING_DAYS));

  const { data: events = [], isLoading, error } = useCalendarEvents(from, to);

  // Månadsvyn visar en flerdagshändelse på var och en av dess dagar; listan
  // visar den en gång, på dagen den börjar (eller i dag om den redan pågår).
  const occurrences = useMemo(
    () =>
      events
        .flatMap((event) => event.occurrences.map((start): Occurrence => {
          if (view === "upcoming") return { date: start < todayIso ? todayIso : start, start, event };
          return { date: start, start, event };
        }))
        .flatMap((o) =>
          view === "month"
            ? Array.from({ length: o.event.duration_days }, (_x, i) => ({ ...o, date: toIsoDate(addDays(fromIsoDate(o.start), i)) }))
            : [o],
        )
        .sort(byTime),
    [events, view, todayIso],
  );
  const byDate = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    for (const o of occurrences) map.set(o.date, [...(map.get(o.date) ?? []), o]);
    return map;
  }, [occurrences]);

  // Månadsvyn visar periodens förändringar; loggvyn hela loggen.
  const { data: changes = [], isLoading: changesLoading } = useChangeEntries(
    view === "changes" ? undefined : from,
    view === "changes" ? undefined : to,
  );
  const changesByDate = useMemo(() => {
    const map = new Map<string, ChangeEntry[]>();
    for (const c of [...changes].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
      const first = c.starts_at.slice(0, 10);
      const days = daysBetween(first, (c.ends_at ?? c.starts_at).slice(0, 10));
      for (let i = 0; i <= days; i++) {
        const day = toIsoDate(addDays(fromIsoDate(first), i));
        map.set(day, [...(map.get(day) ?? []), c]);
      }
    }
    return map;
  }, [changes]);

  // Öppna poster följer med när listan laddas om efter en ändring.
  const selectedLive = selectedId ? events.find((e) => e.id === selectedId) ?? null : null;

  const shiftMonth = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: "auto" }}>
      <Stack direction={{ xs: "column", md: "row" }} alignItems={{ md: "center" }} spacing={2} mb={2}>
        <Box flex={1}>
          <Typography variant="h4" fontWeight={700}>{t("nav.businessCalendar")}</Typography>
          <Typography variant="body2" color="text.secondary">
            Återkommande händelser som verksamheten är beroende av IT för. Alla kan föreslå en post;
            en redaktör fastställer den.
          </Typography>
        </Box>
        <ToggleButtonGroup size="small" exclusive value={view} onChange={(_e, v: View | null) => v && setView(v)}>
          <ToggleButton value="month">Månad</ToggleButton>
          <ToggleButton value="upcoming">Kommande {UPCOMING_DAYS} dagar</ToggleButton>
          <ToggleButton value="changes">Förändringslogg</ToggleButton>
        </ToggleButtonGroup>
        {canManageChanges && (
          <Button variant="outlined" startIcon={<BuildIcon />} onClick={() => setChangeOpen({ entry: null })}>
            Logga förändring
          </Button>
        )}
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ event: null, date: todayIso })}>
          {isEditor ? "Ny aktivitet" : "Föreslå aktivitet"}
        </Button>
      </Stack>

      <Stack direction="row" spacing={2} mb={2} flexWrap="wrap" useFlexGap>
        <Legend color={FREEZE_COLOR} label="Verksamhetskritiskt" icon />
        <Legend color={CHANGE_COLOR} label="Förändring i IT-miljön" />
        <Legend color={EVENT_COLOR} label="Verksamhetshändelse" />
        <Legend color={EVENT_COLOR} label="Förslag – inte fastställt" dashed />
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{errorText(error, "Kunde inte ladda kalendern")}</Alert>}

      {view === "month" ? (
        <Paper variant="outlined">
          <Stack direction="row" alignItems="center" spacing={1} sx={{ p: 1.5 }}>
            <IconButton size="small" onClick={() => shiftMonth(-1)} aria-label="Föregående månad"><ChevronLeftIcon /></IconButton>
            <IconButton size="small" onClick={() => shiftMonth(1)} aria-label="Nästa månad"><ChevronRightIcon /></IconButton>
            <Typography variant="h6" sx={{ textTransform: "capitalize", flex: 1 }}>
              {monthName(month.getMonth())} {month.getFullYear()}
            </Typography>
            {isLoading && <CircularProgress size={18} />}
            <Button size="small" onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}>I dag</Button>
          </Stack>
          <Box sx={{ display: "grid", gridTemplateColumns: "36px repeat(7, minmax(0, 1fr))", borderTop: 1, borderColor: "divider" }}>
            <Box />
            {WEEKDAY_HEADERS.map((d) => (
              <Typography key={d} variant="caption" color="text.secondary" sx={{ p: 0.5, textAlign: "center", fontWeight: 600 }}>
                {d}
              </Typography>
            ))}
            {Array.from({ length: weeks }, (_w, w) => {
              const monday = addDays(gridStart, w * 7);
              return (
                <React.Fragment key={w}>
                  <Typography variant="caption" color="text.secondary" sx={{ p: 0.5, textAlign: "center", borderTop: 1, borderColor: "divider" }}>
                    v{weekNumber(monday)}
                  </Typography>
                  {Array.from({ length: 7 }, (_d, d) => {
                    const day = addDays(monday, d);
                    const iso = toIsoDate(day);
                    const inMonth = day.getMonth() === month.getMonth();
                    return (
                      <Box
                        key={iso}
                        onDoubleClick={() => setEditing({ event: null, date: iso })}
                        sx={{
                          minHeight: 104, p: 0.5, borderTop: 1, borderLeft: 1, borderColor: "divider",
                          bgcolor: inMonth ? (d > 4 ? "action.hover" : "background.paper") : "action.selected",
                          opacity: inMonth ? 1 : 0.6,
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            display: "inline-block", minWidth: 22, textAlign: "center", borderRadius: 10, mb: 0.25,
                            ...(iso === todayIso && { bgcolor: "primary.main", color: "primary.contrastText", fontWeight: 700 }),
                          }}
                        >
                          {day.getDate()}
                        </Typography>
                        <Stack spacing={0.25}>
                          {(byDate.get(iso) ?? []).map(({ event, start }) => (
                            <EventPill key={`${event.id}-${start}`} event={event} start={start} date={iso} onClick={() => setSelectedId(event.id)} />
                          ))}
                          {(changesByDate.get(iso) ?? []).map((c) => (
                            <ChangePill key={c.id} entry={c} date={iso} onClick={() => setChangeOpen({ entry: c })} />
                          ))}
                        </Stack>
                      </Box>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </Box>
        </Paper>
      ) : view === "changes" ? (
        changesLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress /></Box>
        ) : (
          <ChangeLogTable entries={changes} onOpen={(c) => setChangeOpen({ entry: c })} />
        )
      ) : isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress /></Box>
      ) : occurrences.length === 0 ? (
        <Typography color="text.secondary">Inga händelser de kommande {UPCOMING_DAYS} dagarna.</Typography>
      ) : (
        <Stack spacing={2}>
          {[...byDate.entries()].map(([date, items]) => (
            <Box key={date}>
              <Typography variant="subtitle2" sx={{ textTransform: "capitalize", mb: 0.5 }}>
                {shortDate(date)}{date === todayIso && " · i dag"}
              </Typography>
              <Stack spacing={1}>
                {items.map(({ event, start }) => (
                  <Paper
                    key={`${event.id}-${start}`}
                    variant="outlined"
                    onClick={() => setSelectedId(event.id)}
                    sx={{
                      p: 1.5, cursor: "pointer", borderLeft: `4px ${event.status === "proposed" ? "dashed" : "solid"} ${eventColor(event)}`,
                      "&:hover": { bgcolor: "action.hover" },
                    }}
                  >
                    <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 92 }}>
                        {event.duration_days > 1
                          ? `${compactDate(start)} – ${compactDate(occurrenceEnd(start, event))}`
                          : timeLabel(event)}
                      </Typography>
                      <Typography fontWeight={600}>{event.title}</Typography>
                      <StatusChips event={event} />
                      {event.departments.map((d) => <Chip key={d} size="small" label={d} />)}
                      <Box flex={1} />
                      <DependencyChips event={event} />
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}

      {selectedLive && (
        <EventDetailDialog
          event={selectedLive}
          canEdit={isEditor || (selectedLive.status === "proposed" && selectedLive.proposed_by_id === userId)}
          onEdit={() => {
            setEditing({ event: selectedLive, date: selectedLive.start_date });
            setSelectedId(null);
          }}
          onClose={() => setSelectedId(null)}
        />
      )}
      {editing && (
        <EventFormDialog event={editing.event} initialDate={editing.date} onClose={() => setEditing(null)} />
      )}
      {changeOpen && (
        <ChangeEntryDialog
          entry={changeOpen.entry}
          initialStart={`${todayIso}T08:00`}
          canManage={canManageChanges}
          onClose={() => setChangeOpen(null)}
        />
      )}
    </Box>
  );
};

/** En förändring i en dagruta. Varningstriangel = genomförs trots krock med en verksamhetspost. */
const ChangePill: React.FC<{ entry: ChangeEntry; date: string; onClick: () => void }> = ({ entry, date, onClick }) => {
  const firstDay = entry.starts_at.slice(0, 10) === date;
  const pending = entry.approval_status !== "approved";
  return (
    <Tooltip
      title={`Förändring · ${changeWhenLabel(entry)} · ${entry.title} · ${APPROVAL_STATUS_LABELS[entry.approval_status]}`}
      disableInteractive
    >
      <Box
        onClick={onClick}
        onDoubleClick={(e) => e.stopPropagation()}
        sx={{
          display: "flex", alignItems: "center", gap: 0.5, px: 0.5, py: 0.125, borderRadius: 0.5, cursor: "pointer",
          fontSize: 12, lineHeight: 1.5, border: `1px ${pending ? "dashed" : "solid"} ${CHANGE_COLOR}`,
          ...(pending ? { color: CHANGE_COLOR } : { bgcolor: CHANGE_COLOR, color: "#fff" }),
          "&:hover": { filter: "brightness(1.1)" },
        }}
      >
        {entry.conflicts.length > 0
          ? <WarningAmberIcon sx={{ fontSize: 12, flexShrink: 0 }} />
          : <BuildIcon sx={{ fontSize: 11, flexShrink: 0 }} />}
        <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {firstDay ? `${entry.starts_at.slice(11, 16)} ` : "↳ "}{entry.title}
        </Box>
      </Box>
    </Tooltip>
  );
};

const ChangeLogTable: React.FC<{ entries: ChangeEntry[]; onOpen: (c: ChangeEntry) => void }> = ({ entries, onOpen }) =>
  entries.length === 0 ? (
    <Typography color="text.secondary">Förändringsloggen är tom.</Typography>
  ) : (
    <Paper variant="outlined" sx={{ overflowX: "auto" }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Datum och tid</TableCell>
            <TableCell>Förändring</TableCell>
            <TableCell>Typ</TableCell>
            <TableCell>Berörs</TableCell>
            <TableCell>Påverkan</TableCell>
            <TableCell>Godkännande</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {entries.map((c) => (
            <TableRow key={c.id} hover sx={{ cursor: "pointer" }} onClick={() => onOpen(c)}>
              <TableCell sx={{ whiteSpace: "nowrap" }}>{changeWhenLabel(c)}</TableCell>
              <TableCell>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  {c.conflicts.length > 0 && (
                    <Tooltip title={`Genomförs trots krock med ${c.conflicts.map((k) => k.title).join(", ")}`}>
                      <WarningAmberIcon fontSize="small" color="warning" />
                    </Tooltip>
                  )}
                  <Typography variant="body2" fontWeight={600}>{c.title}</Typography>
                </Stack>
                {c.nodes.length > 0 && (
                  <Typography variant="caption" color="text.secondary">{c.nodes.map((n) => n.name).join(", ")}</Typography>
                )}
              </TableCell>
              <TableCell>{CHANGE_TYPE_LABELS[c.change_type]}</TableCell>
              <TableCell sx={{ whiteSpace: "nowrap" }}>{AFFECTED_SHARE_LABELS[c.affected_share]}</TableCell>
              <TableCell>{USER_IMPACT_LABELS[c.user_impact]}</TableCell>
              <TableCell>
                <Chip
                  size="small"
                  color={c.approval_status === "approved" ? "success" : c.approval_status === "rejected" ? "error" : "default"}
                  label={APPROVAL_STATUS_LABELS[c.approval_status]}
                />
                {c.approved_by && (
                  <Typography variant="caption" color="text.secondary" display="block">{c.approved_by}</Typography>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );

const Legend: React.FC<{ color: string; label: string; dashed?: boolean; icon?: boolean }> = ({ color, label, dashed, icon }) => (
  <Stack direction="row" alignItems="center" spacing={0.75}>
    <Box
      sx={{
        width: 18, height: 12, borderRadius: 0.5, display: "flex", alignItems: "center", justifyContent: "center",
        ...(dashed ? { border: `1px dashed ${color}` } : { bgcolor: color }),
      }}
    >
      {icon && <LockIcon sx={{ fontSize: 9, color: "#fff" }} />}
    </Box>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
  </Stack>
);

/** En post i en dagruta: fylld = fastställd, streckad = förslag. */
const EventPill: React.FC<{ event: CalendarEvent; start: string; date: string; onClick: () => void }> = ({ event, start, date, onClick }) => {
  const color = eventColor(event);
  const proposed = event.status === "proposed";
  // En fortsättningsdag i en flerdagshändelse.
  const continued = date !== start;
  const span = event.duration_days > 1 ? `${compactDate(start)} – ${compactDate(occurrenceEnd(start, event))} · ` : "";
  return (
    <Tooltip title={`${span}${timeLabel(event)} · ${event.title}${proposed ? " (förslag)" : ""}`} disableInteractive>
      <Box
        onClick={onClick}
        onDoubleClick={(e) => e.stopPropagation()}
        sx={{
          display: "flex", alignItems: "center", gap: 0.5, px: 0.5, py: 0.125, borderRadius: 0.5, cursor: "pointer",
          fontSize: 12, lineHeight: 1.5, border: `1px ${proposed ? "dashed" : "solid"} ${color}`,
          ...(proposed ? { color } : { bgcolor: color, color: "#fff" }),
          "&:hover": { filter: "brightness(1.1)" },
        }}
      >
        {event.change_freeze && <LockIcon sx={{ fontSize: 11, flexShrink: 0 }} />}
        <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {continued ? "↳ " : event.start_time ? `${event.start_time.slice(0, 5)} ` : ""}{event.title}
        </Box>
      </Box>
    </Tooltip>
  );
};

const StatusChips: React.FC<{ event: CalendarEvent }> = ({ event }) => (
  <>
    {event.change_freeze && (
      <Chip size="small" icon={<LockIcon />} label="Verksamhetskritiskt" sx={{ bgcolor: FREEZE_COLOR, color: "#fff", "& .MuiChip-icon": { color: "#fff" } }} />
    )}
    {event.status === "proposed" && <Chip size="small" variant="outlined" label="Förslag" sx={{ borderStyle: "dashed" }} />}
  </>
);

const NodeChip: React.FC<{ node: CalendarEventNode; onClick?: () => void }> = ({ node, onClick }) => (
  <Chip
    size="small" variant="outlined" label={node.name} onClick={onClick}
    sx={{ borderColor: nodeColor(node.type), color: nodeColor(node.type) }}
  />
);

/** Det händelsen kräver: kopplade objekt (utom processer) och fritext. */
const DependencyChips: React.FC<{ event: CalendarEvent }> = ({ event }) => (
  <>
    {event.nodes.filter((n) => n.type !== "Process").map((n) => <NodeChip key={n.id} node={n} />)}
    {event.other_dependencies && <Chip size="small" variant="outlined" label={event.other_dependencies} />}
  </>
);

const DetailRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <Box>
    <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
    {children}
  </Box>
);

const EventDetailDialog: React.FC<{
  event: CalendarEvent;
  canEdit: boolean;
  onEdit: () => void;
  onClose: () => void;
}> = ({ event, canEdit, onEdit, onClose }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isEditor } = useRoleStore();
  const resolve = useResolveCalendarEvent();
  const remove = useDeleteCalendarEvent();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const proposed = event.status === "proposed";
  const busy = resolve.isPending || remove.isPending;
  const failure = resolve.error ?? remove.error;

  const processes = event.nodes.filter((n) => n.type === "Process");
  const dependencies = event.nodes.filter((n) => n.type !== "Process");
  const open = (n: CalendarEventNode) => {
    const route = CALENDAR_NODE_ROUTES[n.type];
    if (route) navigate(`${route}?id=${n.id}`);
  };
  // Den som föreslagit drar tillbaka; en redaktör tar bort posten helt.
  const withdraws = proposed && !isEditor;

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
          <span>{event.title}</span>
          <StatusChips event={event} />
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {event.change_freeze && (
            <Alert severity="error" icon={<LockIcon />}>
              Inga förändringar får genomföras som påverkar dem som arbetar med detta
              {event.duration_days > 1
                ? event.start_time && event.end_time
                  ? ` – från ${event.start_time.slice(0, 5)} första dagen till ${event.end_time.slice(0, 5)} sista dagen, varje gång händelsen infaller.`
                  : " – alla dagar som händelsen pågår."
                : event.start_time ? ` – ${timeLabel(event)} de dagar händelsen infaller.` : " – hela dagen då händelsen infaller."}
            </Alert>
          )}
          <DetailRow label="När">
            <Typography>
              {event.recurrence === "once" ? spanLabel(event.start_date, event) : recurrenceLabel(event.recurrence, event.start_date)}
              {" · "}{timeLabel(event)}
            </Typography>
            {event.recurrence !== "once" && (
              <Typography variant="body2" color="text.secondary">
                Från {event.start_date}{event.end_date ? ` till ${event.end_date}` : ", tills vidare"}
              </Typography>
            )}
          </DetailRow>
          {event.description && (
            <DetailRow label="Beskrivning">
              <Typography sx={{ whiteSpace: "pre-wrap" }}>{event.description}</Typography>
            </DetailRow>
          )}
          {(dependencies.length > 0 || event.other_dependencies) && (
            <DetailRow label="Måste fungera">
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {dependencies.map((n) => (
                  <Tooltip key={n.id} title={t(`nodeTypes.${n.type}`)}>
                    <span><NodeChip node={n} onClick={() => open(n)} /></span>
                  </Tooltip>
                ))}
              </Stack>
              {event.other_dependencies && (
                <Typography variant="body2" sx={{ mt: dependencies.length ? 0.5 : 0, whiteSpace: "pre-wrap" }}>
                  {event.other_dependencies}
                </Typography>
              )}
            </DetailRow>
          )}
          {processes.length > 0 && (
            <DetailRow label="Berörd process">
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {processes.map((n) => <NodeChip key={n.id} node={n} onClick={() => open(n)} />)}
              </Stack>
            </DetailRow>
          )}
          {event.departments.length > 0 && (
            <DetailRow label="Berörd avdelning">
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {event.departments.map((d) => <Chip key={d} size="small" label={d} />)}
              </Stack>
            </DetailRow>
          )}
          {event.responsible && (
            <DetailRow label="Ansvarig / kontakt"><Typography>{event.responsible}</Typography></DetailRow>
          )}
          <Typography variant="caption" color="text.secondary">
            {proposed ? "Föreslagen" : "Upplagd"} av {event.proposed_by ?? "okänd"} {new Date(event.created_at).toLocaleDateString("sv-SE")}
            {!proposed && event.resolved_by && event.resolved_by !== event.proposed_by && ` · fastställd av ${event.resolved_by}`}
          </Typography>
          {failure && <Alert severity="error">{errorText(failure, "Kunde inte uppdatera posten")}</Alert>}
          {confirmRemove && (
            <Alert
              severity="warning"
              action={
                <Button color="inherit" size="small" disabled={busy} onClick={() => remove.mutate(event.id, { onSuccess: onClose })}>
                  {withdraws ? "Dra tillbaka" : "Ta bort"}
                </Button>
              }
            >
              {withdraws ? "Dra tillbaka förslaget?" : "Ta bort posten ur kalendern? Alla tillfällen försvinner."}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: "wrap", gap: 1 }}>
        {canEdit && !confirmRemove && (
          <Button color="inherit" disabled={busy} onClick={() => setConfirmRemove(true)}>
            {withdraws ? "Dra tillbaka" : "Ta bort"}
          </Button>
        )}
        {canEdit && <Button disabled={busy} onClick={onEdit}>Ändra</Button>}
        <Box flex={1} />
        {isEditor && proposed && (
          <>
            <Button
              color="inherit" startIcon={<BlockIcon />} disabled={busy}
              onClick={() => resolve.mutate({ id: event.id, outcome: "rejected", note: null }, { onSuccess: onClose })}
            >
              Avslå
            </Button>
            <Button
              variant="contained" startIcon={<CheckCircleOutlineIcon />} disabled={busy}
              onClick={() => resolve.mutate({ id: event.id, outcome: "approved", note: null })}
            >
              Fastställ
            </Button>
          </>
        )}
        <Button onClick={onClose}>Stäng</Button>
      </DialogActions>
    </Dialog>
  );
};

const EventFormDialog: React.FC<{
  event: CalendarEvent | null;
  initialDate: string;
  onClose: () => void;
}> = ({ event, initialDate, onClose }) => {
  const { t } = useTranslation();
  const { isEditor } = useRoleStore();
  const create = useCreateCalendarEvent();
  const update = useUpdateCalendarEvent();
  const { data: allNodes = [], isLoading: nodesLoading } = useNodes();
  const { data: departmentList } = useDepartments();
  // Utan katalog från Entra ID är listan ofullständig – då får man skriva själv.
  const freeDepartments = departmentList?.source !== "entra";

  const [form, setForm] = useState<CalendarEventInput>(() => ({
    title: event?.title ?? "",
    description: event?.description ?? "",
    recurrence: event?.recurrence ?? "once",
    start_date: event?.start_date ?? initialDate,
    duration_days: event?.duration_days ?? 1,
    end_date: event?.end_date ?? null,
    start_time: event?.start_time?.slice(0, 5) ?? null,
    end_time: event?.end_time?.slice(0, 5) ?? null,
    change_freeze: event?.change_freeze ?? false,
    responsible: event?.responsible ?? "",
    other_dependencies: event?.other_dependencies ?? "",
    departments: event?.departments ?? [],
    node_ids: event?.nodes.map((n) => n.id) ?? [],
  }));
  const set = <K extends keyof CalendarEventInput>(key: K, value: CalendarEventInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const allDay = form.start_time === null && form.end_time === null;
  const recurring = form.recurrence !== "once";
  // Formuläret visar till-datum; posten sparar antal dagar.
  const lastDay = form.start_date ? occurrenceEnd(form.start_date, form) : "";
  const multiDay = form.duration_days > 1;
  const maxDays = MAX_DURATION_DAYS[form.recurrence];

  const nodeOptions = useMemo(
    () =>
      allNodes
        .filter((n) => n.type in CALENDAR_NODE_ROUTES && (!n.archived || form.node_ids.includes(n.id)))
        .map((n) => ({ id: n.id, name: n.name, type: n.type as string }))
        .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name, "sv")),
    [allNodes, form.node_ids],
  );
  const selectedNodes = nodeOptions.filter((n) => form.node_ids.includes(n.id));

  const problem =
    !form.title.trim() ? "Ange en titel"
    : !form.start_date ? "Ange ett datum"
    : !allDay && !(form.start_time && form.end_time) ? "Ange både start- och sluttid"
    : form.duration_days < 1 ? "Till-datum kan inte ligga före från-datum"
    : maxDays !== undefined && form.duration_days > maxDays ? "Händelsen är längre än tiden mellan två tillfällen"
    : !allDay && !multiDay && form.end_time! <= form.start_time! ? "Sluttiden måste ligga efter starttiden"
    : recurring && form.end_date && form.end_date < form.start_date ? "Återkommer t.o.m. kan inte ligga före första tillfället"
    : null;

  const mutation = event ? update : create;
  const save = () => {
    const input = { ...form, title: form.title.trim(), end_date: recurring ? form.end_date || null : null };
    if (event) update.mutate({ id: event.id, ...input }, { onSuccess: onClose });
    else create.mutate(input, { onSuccess: onClose });
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{event ? "Ändra aktivitet" : isEditor ? "Ny aktivitet" : "Föreslå aktivitet"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {!event && !isEditor && (
            <Alert severity="info">
              Förslaget syns direkt i kalendern, markerat som förslag, tills en redaktör har fastställt det.
            </Alert>
          )}
          <TextField
            label="Titel" required autoFocus fullWidth value={form.title}
            placeholder="T.ex. Nyckelutlämning"
            inputProps={{ maxLength: 255 }}
            onChange={(e) => set("title", e.target.value)}
          />
          <TextField
            label="Beskrivning" fullWidth multiline minRows={2} value={form.description}
            placeholder="Vad händer, och vilka arbetar med det?"
            onChange={(e) => set("description", e.target.value)}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label={recurring ? "Första tillfället från" : "Från datum"} type="date" required fullWidth
              InputLabelProps={{ shrink: true }} value={form.start_date}
              onChange={(e) => set("start_date", e.target.value)}
            />
            <TextField
              label="Till datum" type="date" required fullWidth
              InputLabelProps={{ shrink: true }} value={lastDay}
              inputProps={{ min: form.start_date }}
              helperText={multiDay ? `${form.duration_days} dagar` : "Samma dag = endagshändelse"}
              onChange={(e) =>
                e.target.value && form.start_date && set("duration_days", daysBetween(form.start_date, e.target.value) + 1)
              }
            />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              select label="Återkommer" fullWidth value={form.recurrence}
              onChange={(e) => set("recurrence", e.target.value as CalendarEventInput["recurrence"])}
            >
              {RECURRENCES.map((r) => (
                <MenuItem key={r} value={r}>
                  {form.start_date ? recurrenceLabel(r, form.start_date) : r}
                </MenuItem>
              ))}
            </TextField>
            {recurring && (
              <TextField
                label="Återkommer t.o.m. (valfritt)" type="date" fullWidth
                InputLabelProps={{ shrink: true }} value={form.end_date ?? ""}
                helperText="Tomt = tills vidare."
                onChange={(e) => set("end_date", e.target.value || null)}
              />
            )}
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
            <FormControlLabel
              sx={{ minWidth: 120 }}
              control={
                <Switch
                  checked={allDay}
                  onChange={(e) => setForm((f) => ({
                    ...f,
                    start_time: e.target.checked ? null : "08:00",
                    end_time: e.target.checked ? null : "17:00",
                  }))}
                />
              }
              label="Heldag"
            />
            {!allDay && (
              <>
                <TextField
                  label={multiDay ? "Från (första dagen)" : "Från"} type="time" fullWidth InputLabelProps={{ shrink: true }}
                  value={form.start_time ?? ""} onChange={(e) => set("start_time", e.target.value)}
                />
                <TextField
                  label={multiDay ? "Till (sista dagen)" : "Till"} type="time" fullWidth InputLabelProps={{ shrink: true }}
                  value={form.end_time ?? ""} onChange={(e) => set("end_time", e.target.value)}
                />
              </>
            )}
          </Stack>
          <Autocomplete
            multiple
            loading={nodesLoading}
            options={nodeOptions}
            value={selectedNodes}
            groupBy={(n) => t(`nodeTypes.${n.type}`)}
            getOptionLabel={(n) => n.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            onChange={(_e, value) => set("node_ids", value.map((n) => n.id))}
            renderTags={(value, getTagProps) =>
              value.map((n, index) => {
                const { key, ...tagProps } = getTagProps({ index });
                return (
                  <Chip
                    key={key} size="small" variant="outlined" label={n.name} {...tagProps}
                    sx={{ borderColor: nodeColor(n.type), color: nodeColor(n.type) }}
                  />
                );
              })
            }
            renderInput={(params) => (
              <TextField
                {...params} label="Måste fungera / berörd process"
                helperText="Applikationer, tjänster, teknik och processer som händelsen är beroende av."
              />
            )}
          />
          <Autocomplete
            multiple
            freeSolo={freeDepartments}
            autoSelect={freeDepartments}
            options={(departmentList?.departments ?? []).map((d) => d.name)}
            value={form.departments}
            onChange={(_e, value) => set("departments", value.map((d) => d.trim()).filter(Boolean))}
            renderTags={(value, getTagProps) =>
              value.map((d, index) => {
                const { key, ...tagProps } = getTagProps({ index });
                return <Chip key={key} size="small" label={d} {...tagProps} />;
              })
            }
            renderInput={(params) => (
              <TextField
                {...params} label="Berörd avdelning"
                helperText={
                  freeDepartments
                    ? "Skriv avdelningens namn. Listan fylls från Entra ID när kopplingen är igång."
                    : "Avdelningarna hämtas från Entra ID."
                }
              />
            )}
          />
          <TextField
            label="Övriga beroenden" fullWidth value={form.other_dependencies}
            placeholder="T.ex. Internet, skrivare"
            helperText="Sådant som inte finns som objekt i registret."
            onChange={(e) => set("other_dependencies", e.target.value)}
          />
          <TextField
            label="Ansvarig / kontakt" fullWidth value={form.responsible}
            inputProps={{ maxLength: 255 }}
            onChange={(e) => set("responsible", e.target.value)}
          />
          <Box>
            <FormControlLabel
              control={<Switch color="error" checked={form.change_freeze} onChange={(e) => set("change_freeze", e.target.checked)} />}
              label="Verksamhetskritiskt"
            />
            <Typography variant="body2" color="text.secondary">
              Inga förändringar får genomföras som påverkar dem som arbetar med detta. Det gäller
              {multiDay
                ? allDay ? " alla dagar som händelsen pågår." : ` från ${form.start_time ?? ""} första dagen till ${form.end_time ?? ""} sista dagen.`
                : `${allDay ? " hela dagen" : ` ${form.start_time ?? ""}–${form.end_time ?? ""}`} de dagar händelsen infaller.`}
            </Typography>
          </Box>
          {mutation.isError && <Alert severity="error">{errorText(mutation.error, "Kunde inte spara posten")}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Avbryt</Button>
        <Tooltip title={problem ?? ""}>
          <span>
            <Button variant="contained" disabled={Boolean(problem) || mutation.isPending} onClick={save}>
              {event ? "Spara" : isEditor ? "Lägg till" : "Skicka förslag"}
            </Button>
          </span>
        </Tooltip>
      </DialogActions>
    </Dialog>
  );
};

export default BusinessCalendar;
