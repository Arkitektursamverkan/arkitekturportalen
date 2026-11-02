import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import HttpBackend from "i18next-http-backend";
import { initReactI18next } from "react-i18next";
import { applyAppName } from "./appName";

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    // Swedish is the default/fallback language
    fallbackLng: "sv",
    supportedLngs: ["sv", "en"],
    defaultNS: "translation",
    backend: {
      loadPath: "/locales/{{lng}}/{{ns}}.json",
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "ea_language",
    },
    interpolation: {
      escapeValue: false,
      // Replaced by AppNameSync once the settings and the language are known.
      defaultVariables: { appName: "EA-portalen" },
    },
  });

export const setAppName = (name: string) => applyAppName(i18n, name);

export default i18n;
