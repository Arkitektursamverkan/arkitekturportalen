import { describe, expect, it } from "vitest";
import type { ChangeEvent } from "@/api/changeStatistics";
import {
  ALL_TYPES, LAYERS, autoGrain, csvCell, bucketStart, buckets, countKinds, netEvents, perBucket, perField, perObject, perType, stockPerBucket,
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

describe("netto per objekt", () => {
  const t = (n: number) => new Date(2026, 9, 1, n).toISOString();

  it("räknar ett objekt som pendlar som ingen förändring", () => {
    // Fanns från början, arkiveras och återställs gång på gång.
    const pendlar = [ev(t(1), "removed", "Process", "p"), ev(t(2), "added", "Process", "p"),
      ev(t(3), "removed", "Process", "p"), ev(t(4), "added", "Process", "p")];
    const net = netEvents(pendlar);
    expect(net.events).toEqual([]);
    expect([net.roundTrips, net.dropped]).toEqual([1, 4]);
  });

  it("räknar inte det som kom och försvann, inte heller dess uppdateringar", () => {
    const net = netEvents([ev(t(1), "added", "Server", "s"), ev(t(2), "updated", "Server", "s", ["name"]),
      ev(t(3), "removed", "Server", "s")]);
    expect(net.events).toEqual([]);
    expect(net.roundTrips).toBe(1);
  });

  it("räknar nya och borttagna objekt en gång, vid sista vändningen", () => {
    const events = [
      ev(t(1), "added", "Server", "ny"), ev(t(2), "removed", "Server", "ny"), ev(t(3), "added", "Server", "ny"),
      ev(t(4), "updated", "Server", "ny", ["name"]),
      ev(t(5), "removed", "Application", "bort"), ev(t(6), "added", "Application", "bort"), ev(t(7), "removed", "Application", "bort"),
      ev(t(8), "updated", "Process", "orörd", ["name"]),
    ];
    const net = netEvents(events);
    expect(net.events.map((e) => [e.node_id, e.kind, e.at])).toEqual([
      ["ny", "added", t(3)], ["ny", "updated", t(4)], ["bort", "removed", t(7)], ["orörd", "updated", t(8)],
    ]);
    expect(countKinds(net.events)).toEqual({ added: 1, updated: 2, removed: 1 });
    expect([net.roundTrips, net.dropped]).toEqual([0, 4]);
  });

  it("ger samma netto som händelserna", () => {
    const events = [ev(t(1), "added", "Server", "a"), ev(t(2), "removed", "Server", "a"), ev(t(3), "added", "Server", "b"),
      ev(t(4), "removed", "Server", "c"), ev(t(5), "added", "Server", "c"), ev(t(6), "removed", "Server", "d")];
    const all = countKinds(events);
    const net = countKinds(netEvents(events).events);
    expect([all.added, all.removed]).toEqual([3, 3]);
    expect([net.added, net.removed]).toEqual([1, 1]);
    expect(net.added - net.removed).toBe(all.added - all.removed);
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
