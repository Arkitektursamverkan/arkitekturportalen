import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthError, InteractionStatus } from "@azure/msal-browser";
import AuthGate from "./AuthGate";

const msal = vi.hoisted(() => ({
  instance: { loginRedirect: vi.fn(), handleRedirectPromise: vi.fn() },
  inProgress: "none" as string,
  authenticated: false,
}));

vi.mock("@azure/msal-react", () => ({
  useMsal: () => ({ instance: msal.instance, inProgress: msal.inProgress, accounts: [] }),
  useIsAuthenticated: () => msal.authenticated,
}));

vi.mock("@/api/orgSettings", () => ({
  usePublicOrgSettings: () => ({ data: undefined }),
  orgLogoUrl: () => null,
}));

function renderGate(props: { msalEnabled: boolean; initialError?: unknown }) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthGate {...props}>
        <div>Appens innehåll</div>
      </AuthGate>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  msal.instance.loginRedirect = vi.fn().mockResolvedValue(undefined);
  msal.instance.handleRedirectPromise = vi.fn();
  msal.inProgress = InteractionStatus.None;
  msal.authenticated = false;
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("AuthGate", () => {
  it("lokalt läge: bara det lokala formuläret och inga MSAL-anrop", () => {
    renderGate({ msalEnabled: false });
    expect(screen.queryByText("Logga in med Microsoft")).toBeNull();
    expect(screen.getByLabelText(/E-post/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(msal.instance.handleRedirectPromise).not.toHaveBeenCalled();
    expect(msal.instance.loginRedirect).not.toHaveBeenCalled();
  });

  it("anropar aldrig handleRedirectPromise själv – det gör initMsal före renderingen", () => {
    renderGate({ msalEnabled: true });
    expect(msal.instance.handleRedirectPromise).not.toHaveBeenCalled();
  });

  it("Entra-läge: knappen startar loginRedirect med API-scopet", () => {
    renderGate({ msalEnabled: true });
    fireEvent.click(screen.getByText("Logga in med Microsoft"));
    expect(msal.instance.loginRedirect).toHaveBeenCalledWith({ scopes: [""] });
  });

  it("visar felet från omdirigeringen", () => {
    renderGate({ msalEnabled: true, initialError: new AuthError("access_denied", "c", "AADSTS65004: declined") });
    expect(screen.getByRole("alert").textContent).toContain("Inloggningen avbröts eller nekades. (access_denied, AADSTS65004)");
    expect(screen.getByText("Logga in med Microsoft")).toBeTruthy();
  });

  it("visar fel från loginRedirect", async () => {
    msal.instance.loginRedirect = vi.fn().mockRejectedValue(new AuthError("interaction_in_progress", "c"));
    renderGate({ msalEnabled: true });
    fireEvent.click(screen.getByText("Logga in med Microsoft"));
    expect((await screen.findByRole("alert")).textContent).toContain("En inloggning pågår redan");
  });

  it("visar spinnern medan MSAL arbetar", () => {
    msal.inProgress = InteractionStatus.Startup;
    renderGate({ msalEnabled: true });
    expect(screen.getByText("Loggar in…")).toBeTruthy();
  });

  it("släpper in en Entra-inloggad användare", () => {
    msal.authenticated = true;
    renderGate({ msalEnabled: true });
    expect(screen.getByText("Appens innehåll")).toBeTruthy();
  });

  it("räknar inte MSAL-kontext som inloggning när MSAL är avstängt", () => {
    msal.authenticated = true;
    renderGate({ msalEnabled: false });
    expect(screen.queryByText("Appens innehåll")).toBeNull();
  });
});
