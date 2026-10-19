import {
  Configuration,
  LogLevel,
  PublicClientApplication,
} from "@azure/msal-browser";

// Installation settings come from /config.js, written when the container starts
// (frontend/docker/40-ea-config.sh). The VITE_* variables remain for `npm run dev`.
const runtime = window.__EA_CONFIG__ ?? {};

export const ENTRA_TENANT_ID = runtime.entraTenantId || import.meta.env.VITE_ENTRA_TENANT_ID || "";
export const ENTRA_CLIENT_ID = runtime.entraClientId || import.meta.env.VITE_ENTRA_CLIENT_ID || "";
export const ENTRA_API_SCOPE = runtime.entraApiScope || import.meta.env.VITE_ENTRA_API_SCOPE || "";

export const isAuthConfigured = Boolean(ENTRA_TENANT_ID && ENTRA_CLIENT_ID && ENTRA_API_SCOPE);

const msalConfig: Configuration = {
  auth: {
    clientId: ENTRA_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${ENTRA_TENANT_ID}`,
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message) => {
        if (level === LogLevel.Error) {
          console.error("[MSAL]", message);
        }
      },
      logLevel: LogLevel.Warning,
    },
  },
};

export const msalInstance = new PublicClientApplication(msalConfig);

export const loginRequest = {
  scopes: [ENTRA_API_SCOPE],
};

/** Läsa personer och avdelningar ur katalogen – begärs bara när en admin hämtar katalogen. */
export const directoryRequest = {
  scopes: ["https://graph.microsoft.com/User.Read.All"],
};

export const tokenRequest = {
  scopes: [ENTRA_API_SCOPE],
};
