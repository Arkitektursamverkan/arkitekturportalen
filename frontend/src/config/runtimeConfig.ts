/**
 * Installation settings before anything else loads.
 *
 * /config.js (frontend/docker/40-ea-config.sh) sets window.__EA_CONFIG__ from
 * the web container's environment. What it leaves empty – on Render nothing
 * is typed in on the web at all – is fetched from the API
 * (GET /api/v1/client-config): the Entra ids of the portal's app registration
 * and Arkitekten's address, which Arkitekten registers itself. The container's
 * own values always win.
 *
 * Must run before msalConfig.ts and config/modules.ts are imported: they read
 * the settings once, when they load.
 */

interface ClientConfig {
  entra_tenant_id?: string;
  entra_client_id?: string;
  entra_api_scope?: string;
  arkitekten_url?: string;
}

const needsFetch = (c: EaRuntimeConfig) => !c.entraClientId || !c.entraTenantId || !c.arkitektenUrl;

export async function loadRuntimeConfig(fetcher: typeof fetch = fetch, timeoutMs = 5000): Promise<EaRuntimeConfig> {
  const current: EaRuntimeConfig = { ...(window.__EA_CONFIG__ ?? {}) };
  if (needsFetch(current)) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetcher("/api/v1/client-config", { signal: ctrl.signal, credentials: "same-origin" });
      if (res.ok) {
        const c = (await res.json()) as ClientConfig;
        // Entra comes as a whole: never the tenant of one registration with
        // the client of another.
        if (!current.entraClientId && !current.entraTenantId && c.entra_client_id && c.entra_tenant_id) {
          current.entraTenantId = c.entra_tenant_id;
          current.entraClientId = c.entra_client_id;
          current.entraApiScope = current.entraApiScope || c.entra_api_scope || "";
        }
        if (!current.arkitektenUrl && c.arkitekten_url) current.arkitektenUrl = c.arkitekten_url;
      }
    } catch {
      // The API is not reachable: start with what /config.js gave. Sign-in
      // then shows its own error, which says more than a blank page.
    } finally {
      clearTimeout(timer);
    }
  }
  window.__EA_CONFIG__ = current;
  return current;
}
