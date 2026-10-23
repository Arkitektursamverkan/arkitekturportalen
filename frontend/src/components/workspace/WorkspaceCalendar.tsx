import React, { useMemo, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, IconButton, Paper, Stack, Switch, TextField, Tooltip, Typography, useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DeleteIcon from "@mui/icons-material/Delete";
import PlaceIcon from "@mui/icons-material/Place";
import {
  useCreateEvent, useDeleteEvent, useUpdateEvent, useWorkspaceEvents,
  type EventInput, type WorkspaceEvent,
} from "@/api/workspaces";

const WEEKDAYS = ["Mån", "Tis", "Ons", "Tors", "Fre", "Lör", "Sön"];
const MONTHS = [
  "januari", "februari", "mars", "april", "maj", "juni",
  "juli", "augusti", "september", "oktober", "november", "december",
];

/** Local midnight of the day `date` falls on. */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** The Monday on or before `date` — the calendar weeks start there. */
function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  // getDay() is 0 for Sunday; shift so Monday is 0.
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isoKey(date: Date): string {
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

/** The days an entry covers, so a multi-day event shows up in every cell. */
function eventDays(event: WorkspaceEvent): string[] {
  const start = startOfDay(new Date(event.starts_at));
  const end = event.ends_at ? startOfDay(new Date(event.ends_at)) : start;
  const days: string[] = [];
  for (let d = start; d <= end && days.length < 366; d = addDays(d, 1)) {
    days.push(isoKey(d));
  }
  return days;
}

function clockLabel(event: WorkspaceEvent): string {
  if (event.all_day) return "Heldag";
  const start = new Date(event.starts_at);
  const time = (d: Date) =>
    `${`${d.getHours()}`.padStart(2, "0")}:${`${d.getMinutes()}`.padStart(2, "0")}`;
  if (!event.ends_at) return time(start);
  const end = new Date(event.ends_at);
  return sameDay(start, end) ? `${time(start)}–${time(end)}` : `${time(start)}…`;
}

function longLabel(event: WorkspaceEvent): string {
  const start = new Date(event.starts_at);
  const date = `${start.getDate()} ${MONTHS[start.getMonth()]}`;
  return event.all_day ? `${date} · Heldag` : `${date} · ${clockLabel(event)}`;
}

/** Value for an <input type="datetime-local"> / "date", in local time. */
function toInputValue(iso: string, allDay: boolean): string {
  const d = new Date(iso);
  const pad = (n: number) => `${n}`.padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return allDay ? date : `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Back to an ISO timestamp; a date-only value becomes local midnight. */
function fromInputValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(value.length === 10 ? `${value}T00:00` : value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

interface Props {
  workspaceId: string;
  canEdit: boolean;
}

const WorkspaceCalendar: React.FC<Props> = ({ workspaceId, canEdit }) => {
  const theme = useTheme();
  const { data: events = [], isLoading } = useWorkspaceEvents(workspaceId);
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [editing, setEditing] = useState<WorkspaceEvent | null>(null);
  const [creatingOn, setCreatingOn] = useState<Date | null>(null);

  const today = startOfDay(new Date());
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = startOfWeek(monthStart);

  // Six weeks always, so the grid keeps its height as months change.
  const days = useMemo(
    () => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)),
    [gridStart],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, WorkspaceEvent[]>();
    for (const event of events) {
      for (const key of eventDays(event)) {
        const list = map.get(key);
        if (list) list.push(event);
        else map.set(key, [event]);
      }
    }
    return map;
  }, [events]);

  const upcoming = useMemo(() => {
    const now = new Date();
    return events
      .filter((e) => new Date(e.ends_at ?? e.starts_at) >= now)
      .slice(0, 5);
  }, [events]);

  if (isLoading) {
    return <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress /></Box>;
  }

  return (
    <Box>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <IconButton
            size="small"
            aria-label="Föregående månad"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          >
            <ChevronLeftIcon />
          </IconButton>
          <Typography variant="h6" sx={{ minWidth: 180, textAlign: "center" }}>
            {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
          </Typography>
          <IconButton
            size="small"
            aria-label="Nästa månad"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          >
            <ChevronRightIcon />
          </IconButton>
          <Button size="small" onClick={() => setCursor(startOfDay(new Date()))}>Idag</Button>
        </Stack>
        {canEdit && (
          <Button
            startIcon={<AddIcon />}
            variant="contained"
            size="small"
            onClick={() => setCreatingOn(today)}
          >
            Ny händelse
          </Button>
        )}
      </Stack>

      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0.5, mb: 1 }}>
        {WEEKDAYS.map((d) => (
          <Typography key={d} variant="caption" align="center" sx={{ fontWeight: 700, color: "text.secondary" }}>
            {d}
          </Typography>
        ))}
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0.5 }}>
        {days.map((day) => {
          const dayEvents = byDay.get(isoKey(day)) ?? [];
          const inMonth = day.getMonth() === cursor.getMonth();
          const isToday = sameDay(day, today);
          return (
            <Paper
              key={isoKey(day)}
              variant="outlined"
              onDoubleClick={canEdit ? () => setCreatingOn(day) : undefined}
              sx={{
                minHeight: 96,
                p: 0.75,
                bgcolor: inMonth ? "background.paper" : "action.hover",
                opacity: inMonth ? 1 : 0.6,
                borderColor: isToday ? "primary.main" : undefined,
                borderWidth: isToday ? 2 : 1,
                cursor: canEdit ? "copy" : "default",
              }}
            >
              <Typography variant="caption" sx={{ color: isToday ? "primary.main" : "text.secondary", fontWeight: isToday ? 700 : 500 }}>
                {day.getDate()}
              </Typography>
              <Stack spacing={0.25} sx={{ mt: 0.25 }}>
                {dayEvents.map((event) => (
                  <Tooltip key={event.id} title={`${clockLabel(event)} · ${event.title}`}>
                    <Chip
                      size="small"
                      label={event.all_day ? event.title : `${clockLabel(event)} ${event.title}`}
                      onClick={() => setEditing(event)}
                      sx={{
                        height: 20,
                        justifyContent: "flex-start",
                        bgcolor: theme.palette.primary.main,
                        color: theme.palette.primary.contrastText,
                        "& .MuiChip-label": { px: 0.75, fontSize: 11 },
                      }}
                    />
                  </Tooltip>
                ))}
              </Stack>
            </Paper>
          );
        })}
      </Box>

      {canEdit && (
        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 1 }}>
          Dubbelklicka på en dag för att lägga till en händelse.
        </Typography>
      )}

      <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>Kommande</Typography>
      {upcoming.length === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>Inga kommande händelser.</Typography>
      ) : (
        <Stack spacing={1}>
          {upcoming.map((event) => (
            <Paper
              key={event.id}
              variant="outlined"
              sx={{ p: 1.5, cursor: "pointer" }}
              onClick={() => setEditing(event)}
            >
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{event.title}</Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>{longLabel(event)}</Typography>
                {event.location && (
                  <Stack direction="row" spacing={0.25} sx={{ alignItems: "center" }}>
                    <PlaceIcon sx={{ fontSize: 13, color: "text.secondary" }} />
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>{event.location}</Typography>
                  </Stack>
                )}
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      <EventDialog
        workspaceId={workspaceId}
        canEdit={canEdit}
        event={editing}
        createOn={creatingOn}
        onClose={() => {
          setEditing(null);
          setCreatingOn(null);
        }}
      />
    </Box>
  );
};

const EventDialog: React.FC<{
  workspaceId: string;
  canEdit: boolean;
  event: WorkspaceEvent | null;
  createOn: Date | null;
  onClose: () => void;
}> = ({ workspaceId, canEdit, event, createOn, onClose }) => {
  const create = useCreateEvent(workspaceId);
  const update = useUpdateEvent(workspaceId);
  const del = useDeleteEvent(workspaceId);

  const open = Boolean(event || createOn);
  const [title, setTitle] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Seed the form from the event being edited, or from the day that was clicked.
  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmDelete(false);
    if (event) {
      setTitle(event.title);
      setAllDay(event.all_day);
      setStarts(toInputValue(event.starts_at, event.all_day));
      setEnds(event.ends_at ? toInputValue(event.ends_at, event.all_day) : "");
      setLocation(event.location);
      setDescription(event.description);
    } else if (createOn) {
      const at = new Date(createOn);
      at.setHours(9, 0, 0, 0);
      setTitle("");
      setAllDay(false);
      setStarts(toInputValue(at.toISOString(), false));
      setEnds("");
      setLocation("");
      setDescription("");
    }
  }, [open, event, createOn]);

  // Switching to all-day drops the clock from the values already typed.
  const onAllDayChange = (next: boolean) => {
    setAllDay(next);
    setStarts((v) => (v ? (next ? v.slice(0, 10) : `${v.slice(0, 10)}T09:00`) : v));
    setEnds((v) => (v ? (next ? v.slice(0, 10) : `${v.slice(0, 10)}T10:00`) : v));
  };

  const save = async () => {
    setError(null);
    const startsIso = fromInputValue(starts);
    if (!title.trim() || !startsIso) {
      setError("Rubrik och starttid behövs.");
      return;
    }
    const endsIso = fromInputValue(ends);
    if (endsIso && endsIso < startsIso) {
      setError("Sluttiden ligger före starttiden.");
      return;
    }
    const input: EventInput = {
      title: title.trim(),
      starts_at: startsIso,
      ends_at: endsIso,
      all_day: allDay,
      location: location.trim(),
      description: description.trim(),
    };
    try {
      if (event) await update.mutateAsync({ id: event.id, ...input });
      else await create.mutateAsync(input);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte spara händelsen");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{event ? "Händelse" : "Ny händelse"}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Rubrik"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!canEdit}
            fullWidth
            autoFocus
          />
          <FormControlLabel
            control={
              <Switch
                checked={allDay}
                onChange={(e) => onAllDayChange(e.target.checked)}
                disabled={!canEdit}
              />
            }
            label="Heldag"
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Startar"
              type={allDay ? "date" : "datetime-local"}
              value={starts}
              onChange={(e) => setStarts(e.target.value)}
              disabled={!canEdit}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Slutar"
              type={allDay ? "date" : "datetime-local"}
              value={ends}
              onChange={(e) => setEnds(e.target.value)}
              helperText="Valfritt"
              disabled={!canEdit}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>
          <TextField
            label="Plats"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            disabled={!canEdit}
            fullWidth
          />
          <TextField
            label="Beskrivning"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            minRows={3}
            disabled={!canEdit}
            fullWidth
          />
          {event && (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Skapad av {event.created_by ?? "okänd"} ·{" "}
              {new Date(event.created_at).toLocaleString("sv-SE")}
            </Typography>
          )}
          {confirmDelete && event && (
            <Alert
              severity="error"
              action={
                <Stack direction="row" spacing={1}>
                  <Button size="small" onClick={() => setConfirmDelete(false)}>Avbryt</Button>
                  <Button
                    size="small"
                    color="error"
                    variant="contained"
                    onClick={async () => {
                      try {
                        await del.mutateAsync(event.id);
                        onClose();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Kunde inte ta bort händelsen");
                      }
                    }}
                  >
                    Ta bort
                  </Button>
                </Stack>
              }
            >
              Ta bort händelsen permanent?
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {canEdit && event && !confirmDelete && (
          <Button
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => setConfirmDelete(true)}
            sx={{ mr: "auto" }}
          >
            Ta bort
          </Button>
        )}
        <Button onClick={onClose}>Stäng</Button>
        {canEdit && (
          <Button
            variant="contained"
            disabled={create.isPending || update.isPending}
            onClick={save}
          >
            Spara
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default WorkspaceCalendar;
