import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import { adminNotificationsKey } from "./adminNotifications";

/**
 * Verksamhetskalendern.
 *
 * Återkommande händelser som verksamheten är beroende av IT för – t.ex.
 * nyckelutlämning första vardagen i månaden. Vem som helst föreslår en post;
 * en redaktör fastställer. Förslag visas för alla, markerade som förslag.
 * En verksamhetskritisk post betyder: inga ändringar som påverkar dem som
 * arbetar med händelsen, under postens egna tider.
 */
export type CalendarRecurrence =
  | "once"
  | "weekly"
  | "monthly_day"
  | "monthly_nth_weekday"
  | "monthly_first_workday"
  | "monthly_last_workday"
  | "yearly";

export interface CalendarEventNode {
  id: string;
  name: string;
  type: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  recurrence: CalendarRecurrence;
  /** Första datum; regeln läser veckodag / dag i månaden ur det. */
  start_date: string;
  /** Antal dagar varje tillfälle pågår; 1 = en enda dag. */
  duration_days: number;
  /** Sista dag ett tillfälle får börja; null = tills vidare. */
  end_date: string | null;
  /** Båda null = heldag. "HH:MM:SS". Över flera dagar gäller starttiden första dagen och sluttiden sista. */
  start_time: string | null;
  end_time: string | null;
  change_freeze: boolean;
  responsible: string;
  other_dependencies: string;
  /** Berörda avdelningar, med namnen som Entra ID har dem. */
  departments: string[];
  nodes: CalendarEventNode[];
  status: "proposed" | "approved" | "rejected" | "withdrawn";
  proposed_by: string | null;
  proposed_by_id: string | null;
  created_at: string;
  updated_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  /** Datumen posten infaller på inom den efterfrågade perioden. */
  occurrences: string[];
}

export interface CalendarEventInput {
  title: string;
  description: string;
  recurrence: CalendarRecurrence;
  start_date: string;
  duration_days: number;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  change_freeze: boolean;
  responsible: string;
  other_dependencies: string;
  departments: string[];
  node_ids: string[];
}

export const calendarKeys = {
  all: ["calendar"] as const,
  range: (from: string, to: string) => [...calendarKeys.all, "range", from, to] as const,
};

// ── Datum utan tidszon: "YYYY-MM-DD" hela vägen ─────────────────────────────

export const toIsoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const fromIsoDate = (s: string): Date => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Antal dagar från a till b (b − a). */
export const daysBetween = (a: string, b: string): number =>
  Math.round((fromIsoDate(b).getTime() - fromIsoDate(a).getTime()) / 86_400_000);

/** Sista dagen för ett tillfälle som börjar på `start`. */
export const occurrenceEnd = (start: string, e: Pick<CalendarEvent, "duration_days">): string =>
  toIsoDate(addDays(fromIsoDate(start), e.duration_days - 1));

/** Längsta tillfälle per regel innan det skulle gå in i nästa (samma gränser som i API:t). */
export const MAX_DURATION_DAYS: Partial<Record<CalendarRecurrence, number>> = {
  weekly: 7,
  monthly_day: 28,
  monthly_nth_weekday: 28,
  monthly_first_workday: 28,
  monthly_last_workday: 28,
  yearly: 365,
};

const WEEKDAYS = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"];
const MONTHS = [
  "januari", "februari", "mars", "april", "maj", "juni",
  "juli", "augusti", "september", "oktober", "november", "december",
];
const NTH = ["första", "andra", "tredje", "fjärde", "sista"];

export const monthName = (month: number): string => MONTHS[month];

const ordinal = (n: number): string => `${n}:${n % 10 === 1 || n % 10 === 2 ? (n === 11 || n === 12 ? "e" : "a") : "e"}`;

/** Regeln i klartext, utläst ur postens första datum. */
export function recurrenceLabel(recurrence: CalendarRecurrence, startDate: string): string {
  const d = fromIsoDate(startDate);
  const weekday = WEEKDAYS[d.getDay()];
  switch (recurrence) {
    case "once":
      return "Engångshändelse";
    case "weekly":
      return `Varje ${weekday}`;
    case "monthly_day":
      return `Den ${ordinal(d.getDate())} varje månad`;
    case "monthly_nth_weekday":
      return `Den ${NTH[Math.floor((d.getDate() - 1) / 7)]} ${weekday}en varje månad`;
    case "monthly_first_workday":
      return "Första vardagen varje månad";
    case "monthly_last_workday":
      return "Sista vardagen varje månad";
    case "yearly":
      return `Varje år den ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  }
}

/** Regeln med period: "Första vardagen varje månad, från 2026-01-01". */
export function longRecurrenceLabel(e: Pick<CalendarEvent, "recurrence" | "start_date" | "end_date" | "duration_days">): string {
  if (e.recurrence === "once") {
    return e.duration_days > 1 ? `${e.start_date} – ${occurrenceEnd(e.start_date, e)}` : e.start_date;
  }
  return `${recurrenceLabel(e.recurrence, e.start_date)}, från ${e.start_date}${e.end_date ? ` till ${e.end_date}` : ""}`;
}

export const RECURRENCES: CalendarRecurrence[] = [
  "once", "weekly", "monthly_day", "monthly_nth_weekday",
  "monthly_first_workday", "monthly_last_workday", "yearly",
];

/** "08:00–17:00" eller "Heldag"; över flera dagar "3 dagar, 08:00 första dagen till 17:00 sista dagen". */
export const timeLabel = (e: Pick<CalendarEvent, "start_time" | "end_time" | "duration_days">): string => {
  const timed = e.start_time && e.end_time;
  if (e.duration_days > 1) {
    return timed
      ? `${e.duration_days} dagar, ${e.start_time!.slice(0, 5)} första dagen till ${e.end_time!.slice(0, 5)} sista dagen`
      : `${e.duration_days} dagar`;
  }
  return timed ? `${e.start_time!.slice(0, 5)}–${e.end_time!.slice(0, 5)}` : "Heldag";
};

/** "2 okt." */
export const compactDate = (iso: string): string =>
  fromIsoDate(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });

/** Ett tillfälles dagar: "fredag 2 oktober" eller "fredag 2 oktober – söndag 4 oktober". */
export const spanLabel = (start: string, e: Pick<CalendarEvent, "duration_days">): string =>
  e.duration_days > 1 ? `${shortDate(start)} – ${shortDate(occurrenceEnd(start, e))}` : shortDate(start);

/** "fredag 2 oktober". */
export const shortDate = (iso: string): string =>
  fromIsoDate(iso).toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" });

/** Sidan där ett kopplat objekt öppnas (med ?id=). */
export const CALENDAR_NODE_ROUTES: Record<string, string> = {
  Process: "/processes",
  Application: "/systems",
  InformationObject: "/info-objects",
  InformationSource: "/info-sources",
  TechnologyComponent: "/tech-components",
  Server: "/servers",
  ServerService: "/server-services",
};

// ── Anrop ────────────────────────────────────────────────────────────────────

export function useCalendarEvents(from: string, to: string) {
  return useQuery({
    queryKey: calendarKeys.range(from, to),
    queryFn: async () => {
      const { data } = await apiClient.get<CalendarEvent[]>("/calendar/events", { params: { from, to } });
      return data;
    },
    placeholderData: (prev) => prev,
  });
}

/** Hur långt fram nästa tillfälle söks för ett objekts händelser. */
const NODE_LOOKAHEAD_DAYS = 366;

/** Poster som är kopplade till ett objekt, med kommande tillfällen. */
export function useNodeCalendarEvents(nodeId: string | undefined) {
  const from = toIsoDate(new Date());
  const to = toIsoDate(addDays(new Date(), NODE_LOOKAHEAD_DAYS));
  return useQuery({
    queryKey: [...calendarKeys.all, "node", nodeId ?? "", from],
    queryFn: async () => {
      const { data } = await apiClient.get<CalendarEvent[]>("/calendar/events", { params: { node_id: nodeId, from, to } });
      return data;
    },
    enabled: Boolean(nodeId),
    staleTime: 60_000,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: calendarKeys.all });
    qc.invalidateQueries({ queryKey: adminNotificationsKey });
  };
}

export function useCreateCalendarEvent() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CalendarEventInput) =>
      apiClient.post<CalendarEvent>("/calendar/events", input).then((r) => r.data),
    onSuccess: invalidate,
  });
}

export function useUpdateCalendarEvent() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...input }: CalendarEventInput & { id: string }) =>
      apiClient.put<CalendarEvent>(`/calendar/events/${id}`, input).then((r) => r.data),
    onSuccess: invalidate,
  });
}

export function useResolveCalendarEvent() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, outcome, note }: { id: string; outcome: "approved" | "rejected"; note: string | null }) =>
      apiClient.post<CalendarEvent>(`/calendar/events/${id}/resolve`, { outcome, note }).then((r) => r.data),
    onSuccess: invalidate,
  });
}

/** Den som föreslagit drar tillbaka sitt förslag; en redaktör tar bort posten. */
export function useDeleteCalendarEvent() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/calendar/events/${id}`),
    onSuccess: invalidate,
  });
}
