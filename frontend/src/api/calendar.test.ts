import { describe, expect, it } from "vitest";
import { RESPONSIBLE_COLORS, responsibleColors, responsibleKey } from "./calendar";

describe("ansvarig i verksamhetskalendern", () => {
  it("ser samma ansvarig oavsett skiftläge och mellanslag", () => {
    expect(responsibleKey("  Ekonomi ")).toBe(responsibleKey("ekonomi"));
    expect(responsibleKey("Ekonomi")).not.toBe(responsibleKey("Ekonomi och inköp"));
  });

  it("räknar ingen angiven som tom", () => {
    expect(responsibleKey("   ")).toBe("");
    expect(responsibleKey(null)).toBe("");
  });

  it("ger varje ansvarig en egen färg så länge färgerna räcker", () => {
    const names = ["Ekonomi", "HR", "IT-drift", "Planering, Uppföljning och Upphandling", "Uthyrning"];
    const colors = responsibleColors(names);
    expect(colors.size).toBe(names.length);
    expect(new Set(colors.values()).size).toBe(names.length);
  });

  it("slår ihop stavningar av samma ansvarig och hoppar över tomma", () => {
    const colors = responsibleColors(["Ekonomi", " ekonomi", "", null, "HR"]);
    expect([...colors.keys()]).toEqual(["ekonomi", "hr"]);
  });

  it("ger samma färger oavsett ordningen posterna kommer i", () => {
    const a = responsibleColors(["HR", "Ekonomi", "Uthyrning"]);
    const b = responsibleColors(["Uthyrning", "HR", "Ekonomi"]);
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
  });

  it("delar färg först när de ansvariga är fler än färgerna", () => {
    const names = Array.from({ length: RESPONSIBLE_COLORS.length + 3 }, (_x, i) => `Enhet ${i}`);
    const colors = responsibleColors(names);
    expect(colors.size).toBe(names.length);
    expect(new Set(colors.values()).size).toBe(RESPONSIBLE_COLORS.length);
  });
});
