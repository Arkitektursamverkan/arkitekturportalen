import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@azure/msal-browser", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@azure/msal-browser")>();
  const { FakePca } = await import("@/test/fakeMsal");
  return { ...orig, PublicClientApplication: FakePca };
});

async function load(entra: boolean) {
  vi.resetModules();
  const fake = await import("@/test/fakeMsal");
  fake.FakePca.reset();
  fake.setEntraConfig(entra);
  const msal = await import("./msal");
  const browser = await import("@azure/msal-browser");
  return { ...fake, ...msal, browser };
}

afterEach(() => {
  window.__EA_CONFIG__ = undefined;
});

describe("initMsal", () => {
  it("skapar ingen instans utan Entra-inställningar", async () => {
    const { initMsal, getMsal, FakePca } = await load(false);
    expect(await initMsal()).toEqual({ instance: null, error: null });
    expect(await getMsal()).toBeNull();
    expect(FakePca.instances).toHaveLength(0);
  });

  it("väntar ut initialize() innan något annat anropas", async () => {
    const { initMsal, FakePca } = await load(true);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    FakePca.nextInitialize = () => gate;

    const started = initMsal();
    await new Promise((r) => setTimeout(r, 10));
    const pca = FakePca.instances[0];
    expect(pca.calls).toEqual(["initialize"]);

    release();
    const { instance, error } = await started;
    expect(error).toBeNull();
    expect(instance).toBe(pca);
    expect(pca.calls[0]).toBe("initialize");
    expect(pca.calls).toContain("handleRedirectPromise");
  });

  it("skapar och initierar bara en instans", async () => {
    const { initMsal, getMsal, FakePca } = await load(true);
    const [a, b] = await Promise.all([initMsal(), getMsal()]);
    expect(FakePca.instances).toHaveLength(1);
    expect(a.instance).toBe(b);
    expect(FakePca.instances[0].calls.filter((c) => c === "initialize")).toHaveLength(1);
  });

  it("sätter kontot från omdirigeringssvaret som aktivt", async () => {
    const { initMsal, FakePca, account } = await load(true);
    FakePca.nextRedirect = async () => ({ account });
    const { instance } = await initMsal();
    expect(instance?.getActiveAccount()).toEqual(account);
  });

  it("återställer ett sparat konto när inget svar finns", async () => {
    const { initMsal, FakePca, account } = await load(true);
    FakePca.cachedAccounts = [account];
    const { instance } = await initMsal();
    expect(instance?.getActiveAccount()).toEqual(account);
  });

  it("lämnar felet från omdirigeringen till inloggningssidan i stället för att krascha", async () => {
    const { initMsal, FakePca, browser, describeAuthError } = await load(true);
    const serverError = new browser.ServerError(
      "access_denied",
      "corr",
      "AADSTS65004: User declined to consent to access the app.",
    );
    FakePca.nextRedirect = async () => {
      throw serverError;
    };
    const { instance, error } = await initMsal();
    expect(instance).not.toBeNull();
    expect(error).toBe(serverError);
    expect(describeAuthError(error)).toBe("Inloggningen avbröts eller nekades. (access_denied, AADSTS65004)");
  });

  it("startar utan Microsoft-inloggning om initialize() misslyckas", async () => {
    const { initMsal, FakePca } = await load(true);
    FakePca.nextInitialize = () => Promise.reject(new Error("crypto saknas"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { instance, error } = await initMsal();
    expect(instance).toBeNull();
    expect((error as Error).message).toBe("crypto saknas");
  });

  it("sätter aktivt konto vid LOGIN_SUCCESS (MSAL 5: AccountInfo som nyttolast)", async () => {
    const { initMsal, FakePca, account, browser } = await load(true);
    await initMsal();
    const pca = FakePca.instances[0];
    pca.emit(browser.EventType.LOGIN_SUCCESS, account);
    expect(pca.active).toEqual(account);
  });
});

describe("describeAuthError", () => {
  it("visar felkoden för okända MSAL-fel och meddelandet för vanliga fel", async () => {
    const { describeAuthError, browser } = await load(true);
    expect(describeAuthError(new browser.AuthError("something_new", "c"))).toBe(
      "Inloggningen misslyckades. (something_new)",
    );
    expect(describeAuthError(new Error("Nätverksfel"))).toBe("Nätverksfel");
    expect(describeAuthError(undefined)).toBe("Inloggningen misslyckades.");
  });
});
