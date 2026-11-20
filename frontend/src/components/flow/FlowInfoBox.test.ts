import { describe, expect, it } from "vitest";
import { clampInfoBox, readInfoBoxState } from "./FlowInfoBox";

const lager = (v: string | null) => ({ getItem: () => v });

describe("the picture's info box", () => {
  it("starts in the top left corner, open", () => {
    expect(readInfoBoxState(lager(null))).toEqual({ x: 12, y: 8, minimised: false });
  });

  it("remembers where the reader put it, how big, and that it was minimised", () => {
    expect(readInfoBoxState(lager(JSON.stringify({ x: 300, y: 40, w: 500, h: 120, minimised: true })))).toEqual({
      x: 300, y: 40, w: 500, h: 120, minimised: true,
    });
  });

  it("ignores a broken or hostile stored value", () => {
    expect(readInfoBoxState(lager("{"))).toEqual({ x: 12, y: 8, minimised: false });
    expect(readInfoBoxState(lager(JSON.stringify({ x: "1e9", y: -50, w: 2, minimised: "yes" })))).toEqual({
      x: 12, y: 0, w: 160, minimised: false,
    });
  });

  it("can never be dragged out of reach", () => {
    const yta = { width: 800, height: 600 };
    expect(clampInfoBox(-40, -10, yta)).toEqual({ x: 0, y: 0 });
    expect(clampInfoBox(5000, 5000, yta)).toEqual({ x: 740, y: 568 });
    expect(clampInfoBox(200, 100, yta)).toEqual({ x: 200, y: 100 });
  });
});
