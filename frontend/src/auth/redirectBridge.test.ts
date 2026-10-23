import { describe, expect, it, vi } from "vitest";
import { hasAuthResponse, runRedirectBridge } from "./redirectBridge";

const broadcast = vi.fn();
vi.mock("@azure/msal-browser/redirect-bridge", () => ({
  broadcastResponseToMainFrame: () => broadcast(),
}));

describe("hasAuthResponse", () => {
  it.each([
    ["#code=abc&state=s", "", true],
    ["#error=access_denied&error_description=x&state=s", "", true],
    ["", "?code=abc&state=s", true],
    ["", "", false],
    ["#/applications", "", false],
    ["#code=abc", "", false],
    ["", "?state=s", false],
    ["", "?q=search", false],
  ])("hash %j, query %j → %s", (hash, search, expected) => {
    expect(hasAuthResponse({ hash, search })).toBe(expected);
  });
});

describe("runRedirectBridge", () => {
  it("lämnar svaret till MSAL:s brygga", async () => {
    broadcast.mockResolvedValueOnce(undefined);
    expect(await runRedirectBridge()).toBe(true);
    expect(broadcast).toHaveBeenCalledOnce();
  });

  it("låter appen starta om svaret inte kom från MSAL", async () => {
    broadcast.mockRejectedValueOnce(new Error("no_state_in_hash"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await runRedirectBridge()).toBe(false);
  });
});
