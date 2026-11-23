import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Scen } from "@/api/arkflows";
import FlowSceneView from "./FlowSceneView";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
afterEach(cleanup);

const scen = (revision?: Scen["revision"]) =>
  ({ flöde: { id: "a", namn: "a" }, bredd: 400, höjd: 300, defs: "", noder: [], kanter: [], revision }) as unknown as Scen;

describe("the classification in the info box", () => {
  it("shows the level Arkitekten sent with the picture", () => {
    render(<FlowSceneView scen={scen({ version: "1.0", klassning: "Nivå 2 – Betydande skada" })} caption="Bilden" />);
    expect(screen.getByLabelText("flowScene.classificationTitle: Nivå 2 – Betydande skada")).toBeTruthy();
  });

  it("shows nothing when the picture carries no classification", () => {
    render(<FlowSceneView scen={scen({ version: "1.0" })} caption="Bilden" />);
    expect(screen.queryByLabelText(/flowScene.classificationTitle/)).toBeNull();
  });
});
