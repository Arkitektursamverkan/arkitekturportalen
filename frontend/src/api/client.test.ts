import { afterEach, describe, expect, it, vi } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";

vi.mock("@azure/msal-browser", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@azure/msal-browser")>();
  const { FakePca } = await import("@/test/fakeMsal");
  return { ...orig, PublicClientApplication: FakePca };
});

/** Laddar om klienten med en adapter som svarar med den Authorization-rubrik som skickades. */
async function load(entra: boolean) {
  vi.resetModules();
  const fake = await import("@/test/fakeMsal");
  fake.FakePca.reset();
  fake.setEntraConfig(entra);
  const { apiClient } = await import("./client");
  const sent: (string | undefined)[] = [];
  apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    const auth = config.headers?.Authorization as string | undefined;
    sent.push(auth);
    return { data: auth ?? null, status: 200, statusText: "OK", headers: {}, config };
  };
  const browser = await import("@azure/msal-browser");
  return { ...fake, apiClient, sent, browser };
}

afterEach(() => {
  sessionStorage.clear();
  window.__EA_CONFIG__ = undefined;
});

describe("apiClient-interceptorn", () => {
  it("hämtar Entra-biljetten först när MSAL är initierad, även för en tidig begäran", async () => {
    const { apiClient, FakePca, account } = await load(true);
    FakePca.cachedAccounts = [account];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    FakePca.nextInitialize = () => gate;

    // Begäran går iväg innan appen hunnit initiera MSAL.
    const request = apiClient.get("/me");
    await new Promise((r) => setTimeout(r, 10));
    const pca = FakePca.instances[0];
    expect(pca.calls).toEqual(["initialize"]);

    release();
    const { data } = await request;
    expect(data).toBe("Bearer entra-token");
    expect(pca.calls.indexOf("acquireTokenSilent")).toBeGreaterThan(pca.calls.indexOf("initialize"));
  });

  it("skickar biljetten för det aktiva kontot med API-scopet", async () => {
    const { apiClient, FakePca, account } = await load(true);
    FakePca.cachedAccounts = [account];
    await apiClient.get("/me");
    const pca = FakePca.instances[0];
    const spy = vi.spyOn(pca, "acquireTokenSilent");
    await apiClient.get("/me");
    expect(spy).toHaveBeenCalledWith({ scopes: ["api://client-1/access_as_user"], account });
  });

  it("loggar in igen med omdirigering när sessionen gått ut", async () => {
    const { apiClient, FakePca, account, browser } = await load(true);
    FakePca.cachedAccounts = [account];
    await apiClient.get("/warmup");
    const pca = FakePca.instances[0];
    vi.spyOn(pca, "acquireTokenSilent").mockRejectedValue(
      new browser.InteractionRequiredAuthError("interaction_required", "corr"),
    );
    const redirect = vi.spyOn(pca, "acquireTokenRedirect");
    const { data } = await apiClient.get("/me");
    expect(data).toBeNull();
    expect(redirect).toHaveBeenCalledWith({ scopes: ["api://client-1/access_as_user"], account });
  });

  it("skickar ingen biljett utan konto", async () => {
    const { apiClient } = await load(true);
    const { data } = await apiClient.get("/public");
    expect(data).toBeNull();
  });

  it("använder den lokala biljetten före Entra och utan att röra MSAL", async () => {
    const { apiClient, FakePca, localJwt, account } = await load(true);
    FakePca.cachedAccounts = [account];
    const token = localJwt();
    sessionStorage.setItem("ea_local_token", token);
    const { data } = await apiClient.get("/me");
    expect(data).toBe(`Bearer ${token}`);
    expect(FakePca.instances).toHaveLength(0);
  });

  it("fungerar utan Entra (bara lokala konton)", async () => {
    const { apiClient, FakePca } = await load(false);
    const { data } = await apiClient.get("/me");
    expect(data).toBeNull();
    expect(FakePca.instances).toHaveLength(0);
  });
});
