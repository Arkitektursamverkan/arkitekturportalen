import axios, { AxiosError } from "axios";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { isAuthConfigured, msalInstance, tokenRequest } from "@/auth/msalConfig";
import { getLocalToken, hasValidLocalToken, clearLocalToken } from "@/auth/localSession";

export const apiClient = axios.create({
  baseURL: "/api/v1",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30_000,
});

apiClient.interceptors.request.use(async (config) => {
  // 1. Local-account session takes priority if present
  if (hasValidLocalToken()) {
    const token = getLocalToken();
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
      return config;
    }
  }

  // 2. Entra ID via MSAL
  if (isAuthConfigured) {
    const account = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
    if (account) {
      try {
        const result = await msalInstance.acquireTokenSilent({
          ...tokenRequest,
          account,
        });
        config.headers = config.headers ?? {};
        config.headers.Authorization = `Bearer ${result.accessToken}`;
        return config;
      } catch (err) {
        // The Entra session has lapsed: sign in again rather than sending the
        // request without credentials. Several requests can land here at
        // once; MSAL rejects all but the first redirect, which is fine.
        if (err instanceof InteractionRequiredAuthError) {
          msalInstance.acquireTokenRedirect({ ...tokenRequest, account }).catch(() => {});
        }
      }
    }
  }

  // No credentials: the request goes out unauthenticated and the backend
  // answers 401. The API key is for scripts and must never reach the browser.
  return config;
});

// Endpoints that proxy to external systems and propagate the upstream status
// code verbatim. A 401 from these means the user-supplied external credential
// is bad — not that the user's EA session is invalid — so don't sign them out.
const UPSTREAM_PROXY_PATHS = [
  "/import/platform/",      // IntegrationPlatform proxy used by the import wizard
];

function isUpstreamProxyRequest(url: string | undefined): boolean {
  if (!url) return false;
  return UPSTREAM_PROXY_PATHS.some((p) => url.includes(p));
}

apiClient.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    // Auto-logout local sessions when the backend rejects OUR token —
    // but never on an upstream proxy 401, which reflects an external credential.
    if (
      error.response?.status === 401
      && hasValidLocalToken()
      && !isUpstreamProxyRequest(error.config?.url)
    ) {
      clearLocalToken();
    }
    const message =
      (error.response?.data as { detail?: string })?.detail ??
      error.message ??
      "An unexpected error occurred";
    return Promise.reject(new Error(message));
  }
);
