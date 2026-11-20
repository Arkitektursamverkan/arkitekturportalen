import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Scen } from "@/api/arkflows";
import FlowSceneView from "./FlowSceneView";
import MaximizeArea from "./MaximizeArea";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

const scen = (id: string) =>
  ({ flöde: { id, namn: id }, bredd: 400, höjd: 300, defs: "", noder: [], kanter: [] }) as unknown as Scen;

const knapp = (namn: string) => screen.getByRole("button", { name: namn });
const fast = (el: Element | null) => (el ? getComputedStyle(el).position === "fixed" : false);

afterEach(cleanup);

describe("maximising a picture", () => {
  it("takes the whole window and gives it back, with the button or Escape", () => {
    const { container } = render(<FlowSceneView scen={scen("a")} />);
    expect(fast(container.firstElementChild)).toBe(false);

    fireEvent.click(knapp("flowScene.maximize"));
    expect(fast(container.firstElementChild)).toBe(true);
    fireEvent.click(knapp("flowScene.restore"));
    expect(fast(container.firstElementChild)).toBe(false);

    fireEvent.click(knapp("flowScene.maximize"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(fast(container.firstElementChild)).toBe(false);
  });

  it("stays maximised when another picture is chosen, and takes the page's controls along", () => {
    const sida = (id: string) => (
      <MaximizeArea>
        <span>lagerrad</span>
        {/* The pages remount the picture for every new one. */}
        <FlowSceneView key={id} scen={scen(id)} />
      </MaximizeArea>
    );
    const { container, rerender } = render(sida("a"));
    fireEvent.click(knapp("flowScene.maximize"));
    rerender(sida("b"));

    const yta = container.firstElementChild;
    expect(fast(yta)).toBe(true);
    expect(yta?.textContent).toContain("lagerrad");
    // The picture itself fills the area; it is the area that covers the window.
    expect(fast(yta?.lastElementChild ?? null)).toBe(false);
    expect(knapp("flowScene.restore")).toBeTruthy();
  });
});
