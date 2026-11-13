import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, useNavigate } from "react-router-dom";
import type { NavigateFunction } from "react-router-dom";
import type { GraphNode } from "@/types/graph";
import { useGraphStore } from "./graphStore";
import { useClearSelectionOnNavigate } from "./useClearSelectionOnNavigate";

let go: NavigateFunction;
const Probe = () => {
  useClearSelectionOnNavigate();
  go = useNavigate();
  return null;
};
const node = { id: "n1", type: "Application", name: "Lönesystemet" } as unknown as GraphNode;
const selected = () => useGraphStore.getState().selectedNode;

describe("useClearSelectionOnNavigate", () => {
  afterEach(() => { cleanup(); useGraphStore.getState().clearSelection(); });

  it("REGRESSION: the detail panel stayed open when the menu led to another page", () => {
    render(<MemoryRouter initialEntries={["/systems"]}><Probe /></MemoryRouter>);
    act(() => useGraphStore.getState().selectNode(node));
    expect(selected()).toBe(node);
    act(() => { go("/processes"); });
    expect(selected()).toBeNull();
  });

  it("keeps the panel while the page only changes its own query string", () => {
    render(<MemoryRouter initialEntries={["/systems"]}><Probe /></MemoryRouter>);
    act(() => useGraphStore.getState().selectNode(node));
    act(() => { go("/systems?objekt=n1"); });
    expect(selected()).toBe(node);
  });

  it("does not close a panel that is opened on the page one arrives at", () => {
    render(<MemoryRouter initialEntries={["/systems"]}><Probe /></MemoryRouter>);
    act(() => { go("/servers"); });
    act(() => useGraphStore.getState().selectNode(node));
    expect(selected()).toBe(node);
  });
});
