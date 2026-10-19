import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ThemeSettings {
  primaryColor: string;
  secondaryColor: string;
  bgColor: string;
  fontFamily: string;
  logoUrl: string;
  logoBase64: string;
}

interface ThemeStoreState extends ThemeSettings {
  setTheme: (patch: Partial<ThemeSettings>) => void;
  resetTheme: () => void;
}

export const DEFAULT_THEME: ThemeSettings = {
  primaryColor: "#1565C0",
  secondaryColor: "#E91E63",
  bgColor: "#F5F7FA",
  fontFamily: "Inter",
  logoUrl: "",
  logoBase64: "",
};

export const useThemeStore = create<ThemeStoreState>()(
  persist(
    (set) => ({
      ...DEFAULT_THEME,
      setTheme: (patch) => set((s) => ({ ...s, ...patch })),
      resetTheme: () => set(DEFAULT_THEME),
    }),
    { name: "ea_theme" }
  )
);
