import React, { useMemo } from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { SnackbarProvider } from "notistack";
import { MsalProvider } from "@azure/msal-react";
import { buildTheme } from "./theme/theme";
import { useThemeStore } from "./store/themeStore";
import { initMsal } from "./auth/msal";
import AuthGate from "./auth/AuthGate";
import UserSync from "./auth/UserSync";
import "./i18n";
import App from "./App";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

// After a redeploy, a tab loaded before it still references lazy-route
// chunks whose hashed filenames no longer exist on the server. Navigating
// then fails the dynamic import and renders a blank page — reload once to
// pick up the new build. The timestamp guard stops a reload loop if the
// chunk is missing for some other reason.
window.addEventListener("vite:preloadError", (event) => {
  const lastReload = Number(sessionStorage.getItem("chunk-reload-at") ?? 0);
  if (Date.now() - lastReload < 30_000) return;
  sessionStorage.setItem("chunk-reload-at", String(Date.now()));
  event.preventDefault();
  window.location.reload();
});

const GOOGLE_FONTS = [
  "Inter", "Roboto", "Open Sans", "Lato", "Montserrat",
  "Poppins", "Nunito", "Raleway", "Source Sans Pro", "Playfair Display",
];

function injectGoogleFont(family: string) {
  if (!GOOGLE_FONTS.includes(family)) return;
  const id = `gf-${family.replace(/\s+/g, "-")}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;600;700&display=swap`;
  document.head.appendChild(link);
}

interface ThemedAppProps {
  msalEnabled: boolean;
  authError: unknown;
}

const ThemedApp: React.FC<ThemedAppProps> = ({ msalEnabled, authError }) => {
  const { primaryColor, secondaryColor, bgColor, fontFamily, logoUrl, logoBase64 } =
    useThemeStore();

  injectGoogleFont(fontFamily);

  const muiTheme = useMemo(
    () => buildTheme({ primaryColor, secondaryColor, bgColor, fontFamily, logoUrl, logoBase64 }),
    [primaryColor, secondaryColor, bgColor, fontFamily, logoUrl, logoBase64]
  );

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <SnackbarProvider maxSnack={3} anchorOrigin={{ vertical: "bottom", horizontal: "left" }}>
        <AuthGate msalEnabled={msalEnabled} initialError={authError}>
          <UserSync>
            <App />
          </UserSync>
        </AuthGate>
      </SnackbarProvider>
    </ThemeProvider>
  );
};

/** MSAL är initierad (eller avstängd) innan något renderas eller anropar den. */
export async function startApp(): Promise<void> {
  const { instance, error } = await initMsal();

  const app = (
    <QueryClientProvider client={queryClient}>
      <ThemedApp msalEnabled={instance !== null} authError={error} />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      {instance ? <MsalProvider instance={instance}>{app}</MsalProvider> : app}
    </React.StrictMode>,
  );
}
