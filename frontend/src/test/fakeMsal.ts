/**
 * En låtsas-PublicClientApplication för tester. Den beter sig som MSAL 4/5 i
 * det som rör den här rättningen: varje anrop före en avslutad initialize()
 * kastar `uninitialized_public_client_application`.
 */
import type { AccountInfo } from "@azure/msal-browser";

export const account: AccountInfo = {
  homeAccountId: "uid.tid",
  environment: "login.microsoftonline.com",
  tenantId: "tid",
  username: "anna@example.se",
  localAccountId: "uid",
  name: "Anna",
};

type Callback = (event: { eventType: string; payload: unknown }) => void;

class FakePcaImpl {
  static instances: FakePcaImpl[] = [];
  static nextInitialize: () => Promise<void> = async () => {};
  static nextRedirect: () => Promise<unknown> = async () => null;
  static cachedAccounts: AccountInfo[] = [];

  calls: string[] = [];
  initialized = false;
  active: AccountInfo | null = null;
  callbacks: Callback[] = [];
  config: unknown;

  constructor(config: unknown) {
    this.config = config;
    FakePcaImpl.instances.push(this);
  }

  static reset() {
    FakePcaImpl.instances = [];
    FakePcaImpl.nextInitialize = async () => {};
    FakePcaImpl.nextRedirect = async () => null;
    FakePcaImpl.cachedAccounts = [];
  }

  private guard(name: string) {
    this.calls.push(name);
    if (!this.initialized) {
      throw Object.assign(new Error("uninitialized_public_client_application"), {
        errorCode: "uninitialized_public_client_application",
      });
    }
  }

  async initialize() {
    this.calls.push("initialize");
    await FakePcaImpl.nextInitialize();
    this.initialized = true;
  }

  addEventCallback(cb: Callback) {
    this.calls.push("addEventCallback");
    this.callbacks.push(cb);
    return "cb";
  }

  emit(eventType: string, payload: unknown) {
    this.callbacks.forEach((cb) => cb({ eventType, payload }));
  }

  handleRedirectPromise = async () => {
    this.guard("handleRedirectPromise");
    return FakePcaImpl.nextRedirect();
  };

  getAllAccounts = () => {
    this.guard("getAllAccounts");
    return FakePcaImpl.cachedAccounts;
  };

  getActiveAccount = () => {
    this.guard("getActiveAccount");
    return this.active;
  };

  setActiveAccount = (a: AccountInfo | null) => {
    this.guard("setActiveAccount");
    this.active = a;
  };

  acquireTokenSilent = async (_req: unknown): Promise<{ accessToken: string }> => {
    this.guard("acquireTokenSilent");
    return { accessToken: "entra-token" };
  };

  acquireTokenRedirect = async (_req: unknown) => {
    this.guard("acquireTokenRedirect");
  };

  loginRedirect = async (_req: unknown) => {
    this.guard("loginRedirect");
  };

  logoutRedirect = async (_req: unknown) => {
    this.guard("logoutRedirect");
  };
}

// En och samma klass även när testerna laddar om modulerna (vi.resetModules),
// så att vi.mock-fabriken och testet ser samma instanser.
const registry = globalThis as { __fakePca?: typeof FakePcaImpl };
export const FakePca: typeof FakePcaImpl = (registry.__fakePca ??= FakePcaImpl);
export type FakePca = FakePcaImpl;

/** Sätter Entra-inställningarna som /config.js skulle ha gjort. */
export function setEntraConfig(on: boolean) {
  window.__EA_CONFIG__ = on
    ? { entraTenantId: "tenant-1", entraClientId: "client-1", entraApiScope: "api://client-1/access_as_user" }
    : {};
}

/** En JWT som localSession godtar (giltig en timme). */
export function localJwt(): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
  return `x.${payload}.y`;
}
