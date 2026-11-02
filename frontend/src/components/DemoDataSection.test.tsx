import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DemoDataSection from "./DemoDataSection";

const mutate = vi.fn();
let status: { available: boolean } | undefined;

vi.mock("@/api/import", () => ({
  useSeedStatus: () => ({ data: status }),
  useSeedDatabase: () => ({ mutate, isPending: false, isSuccess: false, isError: false }),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

describe("DemoDataSection", () => {
  beforeEach(() => mutate.mockClear());
  afterEach(cleanup);

  it("REGRESSION: the button works in a portal without objects", () => {
    // It was hard-coded as disabled, claiming real data even in an empty portal.
    status = { available: true };
    render(<DemoDataSection />);
    expect(screen.queryByText("home.seed.unavailable")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "home.seed.button" }));
    expect(mutate).toHaveBeenCalledOnce();
  });

  it("is disabled once the portal has objects", () => {
    status = { available: false };
    render(<DemoDataSection />);
    expect(screen.getByText("home.seed.unavailable")).toBeTruthy();
    expect((screen.getByRole("button", { name: "home.seed.button" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("stays disabled until the status is known", () => {
    status = undefined;
    render(<DemoDataSection />);
    expect((screen.getByRole("button", { name: "home.seed.button" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
