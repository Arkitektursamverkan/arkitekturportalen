import { createTheme, Theme } from "@mui/material/styles";
import type { ThemeSettings } from "@/store/themeStore";

function safe(color: string, fallback: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
}

export function buildTheme(s: ThemeSettings): Theme {
  return createTheme({
    palette: {
      mode: "light",
      primary: { main: safe(s.primaryColor, "#1565C0") },
      secondary: { main: safe(s.secondaryColor, "#E91E63") },
      background: { default: safe(s.bgColor, "#F5F7FA"), paper: "#FFFFFF" },
    },
    typography: {
      fontFamily: `"${s.fontFamily}", "Roboto", "Helvetica", "Arial", sans-serif`,
      h4: { fontWeight: 700 },
      h5: { fontWeight: 600 },
      h6: { fontWeight: 600 },
    },
    shape: { borderRadius: 8 },
    components: {
      MuiAppBar: {
        styleOverrides: { root: { boxShadow: "0 1px 3px rgba(0,0,0,0.12)" } },
      },
      MuiCard: {
        styleOverrides: { root: { boxShadow: "0 2px 8px rgba(0,0,0,0.08)" } },
      },
    },
  });
}

// Keep a static default export for any legacy import
export { buildTheme as theme };
