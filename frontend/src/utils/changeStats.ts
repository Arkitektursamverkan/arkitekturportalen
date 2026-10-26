/**
 * The arithmetic behind the change statistics (module "changes"): BDAT
 * layers, time buckets, object counts over time and the breakdowns. Pure
 * functions, so the report page only arranges what these return.
 */
import type { ChangeEvent, ChangeKind } from "@/api/changeStatistics";

export type LayerKey = "B" | "D" | "A" | "T";

export interface Layer {
  key: LayerKey;
  label: string;
  types: string[];
}

/** The BDAT layers and the object types under each, in reading order. */
export const LAYERS: Layer[] = [
  { key: "B", label: "Verksamhet", types: ["Process"] },
  { key: "D", label: "Information", types: ["InformationObject", "InformationSource"] },
  { key: "A", label: "Applikation", types: ["Application"] },
  { key: "T", label: "Teknik", types: ["TechnologyComponent", "Server", "ServerService"] },
];

export const ALL_TYPES: string[] = LAYERS.flatMap((l) => l.types);

const LAYER_OF: Record<string, LayerKey> = Object.fromEntries(
  LAYERS.flatMap((l) => l.types.map((t) => [t, l.key])),
);

export function layerOf(type: string): LayerKey {
  return LAYER_OF[type] ?? "T";
}

export function layerLabel(key: LayerKey): string {
  return LAYERS.find((l) => l.key === key)?.label ?? key;
}

export const KINDS: ChangeKind[] = ["added", "updated", "removed"];

export const KIND_LABEL: Record<ChangeKind, string> = {
  added: "Tillagda",
  updated: "Uppdaterade",
  removed: "Borttagna",
};

// ── Colours ──────────────────────────────────────────────────────────────────
// The validated categorical palette, light and dark steps of the same hues.
// Each entity has a fixed slot – a filter never repaints what stays on screen.

const SLOTS = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9"],
};

const KIND_SLOT: Record<ChangeKind, number> = { added: 2, updated: 0, removed: 1 };
const LAYER_SLOT: Record<LayerKey, number> = { B: 0, D: 1, A: 2, T: 3 };

export type Mode = "light" | "dark";

export function kindColor(kind: ChangeKind, mode: Mode): string {
  return SLOTS[mode][KIND_SLOT[kind]];
}

export function layerColor(layer: LayerKey, mode: Mode): string {
  return SLOTS[mode][LAYER_SLOT[layer]];
}

export function typeColor(type: string, mode: Mode): string {
  const i = ALL_TYPES.indexOf(type);
  return SLOTS[mode][i >= 0 ? i : 0];
}

// ── Time ─────────────────────────────────────────────────────────────────────

export type Grain = "day" | "week" | "month";

export const GRAIN_LABEL: Record<Grain, string> = { day: "Dag", week: "Vecka", month: "Månad" };

/** Local midnight at the start of the day. */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** The bucket a moment falls in: its first local moment. Weeks start on Monday. */
export function bucketStart(d: Date, grain: Grain): Date {
  if (grain === "month") return new Date(d.getFullYear(), d.getMonth(), 1);
  const day = startOfDay(d);
  if (grain === "day") return day;
  return addDays(day, -((day.getDay() + 6) % 7));
}

export function nextBucket(d: Date, grain: Grain): Date {
  if (grain === "month") return new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return addDays(d, grain === "week" ? 7 : 1);
}

/** A grain that gives a readable number of columns for the span. */
export function autoGrain(start: Date, end: Date): Grain {
  const days = (end.getTime() - start.getTime()) / 86_400_000;
  if (days <= 62) return "day";
  if (days <= 366) return "week";
  return "month";
}

/** ISO 8601 week number. */
function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

export function bucketLabel(d: Date, grain: Grain): string {
  if (grain === "month") return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (grain === "week") return `v. ${isoWeek(d)} ${d.getFullYear()}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Every bucket from `start` until `end`, so empty periods show as gaps of zero. */
export function buckets(start: Date, end: Date, grain: Grain): Date[] {
  const out: Date[] = [];
  for (let b = bucketStart(start, grain); b < end && out.length < 5000; b = nextBucket(b, grain)) out.push(b);
  return out;
}

// ── Breakdowns ───────────────────────────────────────────────────────────────

export type SplitBy = "kind" | "layer" | "type";

/** The series key an event counts under, for a split. */
export function seriesOf(e: ChangeEvent, split: SplitBy): string {
  if (split === "kind") return e.kind;
  if (split === "layer") return layerOf(e.type);
  return e.type;
}

export interface BucketRow {
  key: string;
  label: string;
  from: Date;
  to: Date;
  total: number;
  [series: string]: number | string | Date;
}

/** Events per bucket and series. */
export function perBucket(events: ChangeEvent[], start: Date, end: Date, grain: Grain, split: SplitBy, series: string[]): BucketRow[] {
  const rows = buckets(start, end, grain).map((b): BucketRow => {
    const row: BucketRow = { key: isoDate(b), label: bucketLabel(b, grain), from: b, to: nextBucket(b, grain), total: 0 };
    series.forEach((s) => (row[s] = 0));
    return row;
  });
  const index = new Map(rows.map((r, i) => [r.key, i]));
  for (const e of events) {
    const i = index.get(isoDate(bucketStart(new Date(e.at), grain)));
    if (i === undefined) continue;
    const s = seriesOf(e, split);
    rows[i][s] = ((rows[i][s] as number) ?? 0) + 1;
    rows[i].total += 1;
  }
  return rows;
}

/**
 * Objects at the end of each bucket, per series, walked back from the count
 * at the end of the period: what was added in a bucket did not exist before it.
 */
export function stockPerBucket(
  events: ChangeEvent[], countAtEnd: Record<string, number>, rows: BucketRow[], grain: Grain, split: SplitBy, series: string[],
): Record<string, number | string>[] {
  const keyOf = (type: string) => (split === "layer" ? layerOf(type) : split === "type" ? type : "total");
  const net = new Map<string, Map<string, number>>();
  for (const e of events) {
    if (e.kind === "updated") continue;
    const b = isoDate(bucketStart(new Date(e.at), grain));
    const m = net.get(b) ?? new Map<string, number>();
    const k = keyOf(e.type);
    m.set(k, (m.get(k) ?? 0) + (e.kind === "added" ? 1 : -1));
    net.set(b, m);
  }
  const level = new Map<string, number>();
  for (const [type, n] of Object.entries(countAtEnd)) level.set(keyOf(type), (level.get(keyOf(type)) ?? 0) + n);
  const keys = split === "kind" ? ["total"] : series;
  const out: Record<string, number | string>[] = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const point: Record<string, number | string> = { key: rows[i].key, label: rows[i].label };
    keys.forEach((k) => (point[k] = level.get(k) ?? 0));
    out.push(point);
    const m = net.get(rows[i].key);
    m?.forEach((n, k) => level.set(k, (level.get(k) ?? 0) - n));
  }
  return out.reverse();
}

export interface KindCounts {
  added: number;
  updated: number;
  removed: number;
}

export function countKinds(events: ChangeEvent[]): KindCounts {
  const c: KindCounts = { added: 0, updated: 0, removed: 0 };
  events.forEach((e) => (c[e.kind] += 1));
  return c;
}

/** Changes per object type, split by kind. */
export function perType(events: ChangeEvent[]): ({ type: string } & KindCounts)[] {
  const m = new Map<string, KindCounts>();
  for (const e of events) {
    const c = m.get(e.type) ?? { added: 0, updated: 0, removed: 0 };
    c[e.kind] += 1;
    m.set(e.type, c);
  }
  return ALL_TYPES.filter((t) => m.has(t)).map((t) => ({ type: t, ...m.get(t)! }));
}

/** How often each field was changed, most often first. */
export function perField(events: ChangeEvent[]): { field: string; count: number }[] {
  const m = new Map<string, number>();
  events.forEach((e) => e.fields.forEach((f) => m.set(f, (m.get(f) ?? 0) + 1)));
  return [...m].map(([field, count]) => ({ field, count })).sort((a, b) => b.count - a.count || a.field.localeCompare(b.field, "sv"));
}

export interface ObjectRow extends KindCounts {
  node_id: string;
  name: string;
  type: string;
  layer: LayerKey;
  last: string;
  /** The object's last event in the period removed it. */
  gone: boolean;
}

/** One row per object, with what happened to it in the period. */
export function perObject(events: ChangeEvent[]): ObjectRow[] {
  const m = new Map<string, ObjectRow>();
  for (const e of events) {
    const r = m.get(e.node_id) ?? {
      node_id: e.node_id, name: e.name ?? "", type: e.type, layer: layerOf(e.type),
      added: 0, updated: 0, removed: 0, last: e.at, gone: false,
    };
    r[e.kind] += 1;
    if (e.at >= r.last) {
      r.last = e.at;
      r.gone = e.kind === "removed";
      if (e.name) r.name = e.name;
    }
    m.set(e.node_id, r);
  }
  return [...m.values()];
}

/** Text for a CSV cell: quoted, with quotes doubled. */
export function csvCell(v: unknown): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}
