import { describe, expect, it } from "vitest";
import type { ChangeEvent } from "@/api/changeStatistics";
import {
  ALL_TYPES, LAYERS, autoGrain, csvCell, bucketStart, buckets, perBucket, perField, perObject, perType, stockPerBucket,
} from "./changeStats";

const ev = (at: string, kind: ChangeEvent["kind"], type: string, node_id = "n1", fields: string[] = []): ChangeEvent => ({
  at, kind, type, node_id, name: node_id, source: "NONE", by_sync: false, by: null, fields,
});

describe("BDAT-lagren", () => {
  it("har varje objekttyp i exakt ett lager", () => {
    expect(LAYERS.flatMap((l) => l.types).sort()).toEqual([...ALL_TYPES].sort());
    expect(new Set(ALL_TYPES).size).toBe(ALL_TYPES.length);
  });
});

describe("tidsintervall", () => {
  it("börjar veckan på måndag", () => {
    const sondag = new Date(2026, 9, 25, 15);
    expect(bucketStart(sondag, "week")).toEqual(new Date(2026, 9, 19));
  });

  it("ger tomma intervall för perioder utan ändringar", () => {
    expect(buckets(new Date(2026, 9, 1), new Date(2026, 9, 4), "day")).toHaveLength(3);
  });

  it("väljer intervall efter periodens längd", () => {
    expect(autoGrain(new Date(2026, 0, 1), new Date(2026, 1, 1))).toBe("day");
    expect(autoGrain(new Date(2026, 0, 1), new Date(2026, 6, 1))).toBe("week");
    expect(autoGrain(new Date(2024, 0, 1), new Date(2026, 0, 1))).toBe("month");
  });
});

describe("fördelningen", () => {
  const start = new Date(2026, 9, 1);
  const end = new Date(2026, 9, 4);
  const events = [
    ev(new Date(2026, 9, 1, 10).toISOString(), "added", "Server", "a"),
    ev(new Date(2026, 9, 2, 10).toISOString(), "updated", "Server", "a", ["name", "owner"]),
    ev(new Date(2026, 9, 2, 11).toISOString(), "added", "Process", "b"),
    ev(new Date(2026, 9, 3, 9).toISOString(), "removed", "Server", "a"),
  ];

  it("räknar per dag och händelse", () => {
    const rows = perBucket(events, start, end, "day", "kind", ["added", "updated", "removed"]);
    expect(rows.map((r) => [r.added, r.updated, r.removed])).toEqual([[1, 0, 0], [1, 1, 0], [0, 0, 1]]);
  });

  it("räknar per BDAT-lager", () => {
    const rows = perBucket(events, start, end, "day", "layer", ["B", "T"]);
    expect(rows[1].B).toBe(1);
    expect(rows[1].T).toBe(1);
  });

  it("räknar antalet objekt bakåt från periodens slut", () => {
    const rows = perBucket(events, start, end, "day", "type", ["Process", "Server"]);
    const stock = stockPerBucket(events, { Process: 5, Server: 3 }, rows, "day", "type", ["Process", "Server"]);
    // Dag 3: slutet. Dag 2: servern fanns fortfarande. Dag 1: processen fanns inte än.
    expect(stock.map((s) => [s.Process, s.Server])).toEqual([[4, 4], [5, 4], [5, 3]]);
  });

  it("summerar per typ, fält och objekt", () => {
    expect(perType(events)).toEqual([
      { type: "Process", added: 1, updated: 0, removed: 0 },
      { type: "Server", added: 1, updated: 1, removed: 1 },
    ]);
    expect(perField(events).map((f) => f.field)).toEqual(["name", "owner"]);
    const a = perObject(events).find((o) => o.node_id === "a")!;
    expect([a.added, a.updated, a.removed, a.gone]).toEqual([1, 1, 1, true]);
  });
});

describe("csvCell", () => {
  it("neutraliserar formler men lämnar vanlig text och tal", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe('"\'=HYPERLINK(""x"")"');
    for (const v of ["+1", "-2+3", "@SUM(A1)", "\tx", "\rx"]) expect(csvCell(v).startsWith(`"'`)).toBe(true);
    expect(csvCell("Faktura")).toBe('"Faktura"');
    expect(csvCell(-3)).toBe('"-3"');
    expect(csvCell(null)).toBe('""');
  });
});
