import { afterEach, describe, expect, it, vi } from "vitest";
import { loadRuntimeConfig } from "./runtimeConfig";

const svar = (body: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);

const portalens = {
  entra_tenant_id: "t-portal",
  entra_client_id: "c-portal",
  entra_api_scope: "api://c-portal/access_as_user",
  arkitekten_url: "https://ark.example.org",
};

afterEach(() => {
  delete window.__EA_CONFIG__;
});

describe("loadRuntimeConfig", () => {
  it("fyller det config.js lämnar tomt ur API:t", async () => {
    window.__EA_CONFIG__ = { entraTenantId: "", entraClientId: "", entraApiScope: "", arkitektenUrl: "" };
    const f = vi.fn(() => svar(portalens));
    const c = await loadRuntimeConfig(f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledWith("/api/v1/client-config", expect.anything());
    expect(c).toEqual({
      entraTenantId: "t-portal",
      entraClientId: "c-portal",
      entraApiScope: "api://c-portal/access_as_user",
      arkitektenUrl: "https://ark.example.org",
    });
    expect(window.__EA_CONFIG__).toEqual(c);
  });

  it("containerns egna värden vinner, och Entra blandas aldrig", async () => {
    window.__EA_CONFIG__ = { entraTenantId: "t-egen", entraClientId: "c-egen", entraApiScope: "s", arkitektenUrl: "" };
    const c = await loadRuntimeConfig((() => svar(portalens)) as unknown as typeof fetch);
    expect(c.entraTenantId).toBe("t-egen");
    expect(c.entraClientId).toBe("c-egen");
    expect(c.arkitektenUrl).toBe("https://ark.example.org");
  });

  it("frågar inte API:t när allt redan finns", async () => {
    window.__EA_CONFIG__ = { entraTenantId: "t", entraClientId: "c", entraApiScope: "s", arkitektenUrl: "https://a" };
    const f = vi.fn();
    await loadRuntimeConfig(f as unknown as typeof fetch);
    expect(f).not.toHaveBeenCalled();
  });

  it("startar ändå när API:t inte svarar", async () => {
    window.__EA_CONFIG__ = { arkitektenUrl: "" };
    const c = await loadRuntimeConfig((() => Promise.reject(new Error("nere"))) as unknown as typeof fetch);
    expect(c).toEqual({ arkitektenUrl: "" });
  });

  it("utan Entra i portalen förblir inloggningen av", async () => {
    window.__EA_CONFIG__ = {};
    const c = await loadRuntimeConfig(
      (() => svar({ entra_tenant_id: "", entra_client_id: "", entra_api_scope: "", arkitekten_url: "" })) as unknown as typeof fetch,
    );
    expect(c.entraClientId).toBeUndefined();
  });
});
