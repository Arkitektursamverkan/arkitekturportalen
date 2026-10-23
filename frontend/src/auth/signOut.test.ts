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
  const { signOut } = await import("./signOut");
  return { ...fake, signOut };
}

afterEach(() => {
  sessionStorage.clear();
  window.__EA_CONFIG__ = undefined;
});

describe("signOut", () => {
  it("glömmer den lokala biljetten och laddar om", async () => {
    const { signOut, localJwt, FakePca } = await load(true);
    sessionStorage.setItem("ea_local_token", localJwt());
    const reload = vi.fn();
    await signOut(reload);
    expect(sessionStorage.getItem("ea_local_token")).toBeNull();
    expect(reload).toHaveBeenCalledOnce();
    expect(FakePca.instances).toHaveLength(0);
  });

  it("loggar ut Microsoft-kontot via Entra efter initieringen", async () => {
    const { signOut, FakePca, account } = await load(true);
    FakePca.cachedAccounts = [account];
    const reload = vi.fn();
    const { getMsal } = await import("./msal");
    const pca = (await getMsal()) as unknown as InstanceType<typeof FakePca>;
    const logout = vi.spyOn(pca, "logoutRedirect");
    await signOut(reload);
    expect(logout).toHaveBeenCalledWith({ account, postLogoutRedirectUri: window.location.origin });
    expect(pca.calls.indexOf("logoutRedirect")).toBeGreaterThan(pca.calls.indexOf("initialize"));
    expect(reload).not.toHaveBeenCalled();
  });

  it("laddar bara om utan Entra", async () => {
    const { signOut, FakePca } = await load(false);
    const reload = vi.fn();
    await signOut(reload);
    expect(reload).toHaveBeenCalledOnce();
    expect(FakePca.instances).toHaveLength(0);
  });
});
