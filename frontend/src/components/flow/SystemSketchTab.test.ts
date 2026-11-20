import { describe, expect, it } from "vitest";
import { arkflowsForServer, type ArkflowSummary, type Scen } from "@/api/arkflows";
import { sceneForLayer, sketchSvg } from "./SystemSketchTab";

const scen = {
  format: "ark-scen",
  bredd: 800,
  höjd: 600,
  bakgrund: '<g><rect width="10" height="10"/><text>Alla</text></g>',
  noder: [],
  kanter: [],
  lager: [{ id: "l-a", namn: "Appen", bakgrund: "<g><text>Appen</text></g>", bredd: 300, höjd: 200 }],
} as unknown as Scen;

describe("the Systemskiss tab", () => {
  it("shows a layer by swapping in Arkitekten's finished picture and its measures", () => {
    expect(sceneForLayer(scen, null)).toBe(scen);
    expect(sceneForLayer(scen, "l-a")).toMatchObject({ bakgrund: "<g><text>Appen</text></g>", bredd: 300, höjd: 200 });
    // An unknown layer (the sketch changed since) falls back to the whole sketch.
    expect(sceneForLayer(scen, "gone")).toBe(scen);
  });

  it("downloads a sanitised, self-contained SVG", () => {
    const farlig = { ...scen, bakgrund: '<g onclick="alert(1)"><script>alert(1)</script><text>Hej</text></g>' } as Scen;
    const svg = sketchSvg(farlig);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"')).toBe(true);
    expect(svg).toContain("Hej");
    expect(svg).not.toContain("script");
    expect(svg).not.toContain("onclick");
  });

  it("a server gets the sketches published onto it — and nothing else", () => {
    const flows = [
      { id: "sk-b", name: "B", familj: "systemskiss", ea_nod_id: "srv" },
      { id: "sk-a", name: "A", familj: "systemskiss", ea_nod_id: "srv" },
      { id: "sk-c", name: "C", familj: "systemskiss", ea_nod_id: "other" },
      { id: "sp", name: "Systemprocess", familj: "flodesschema", ea_nod_id: "srv" },
    ] as ArkflowSummary[];
    expect(arkflowsForServer(flows, "srv").map((f) => f.id)).toEqual(["sk-a", "sk-b"]);
    expect(arkflowsForServer(flows, undefined)).toEqual([]);
  });
});
