import type { i18n as I18n } from "i18next";

/** Sets {{appName}} for every text, and has what is on screen render again. */
export function applyAppName(i18n: I18n, name: string): void {
  // The interpolator reads this same object, so it takes effect on the next t().
  const interpolation = i18n.options.interpolation ?? (i18n.options.interpolation = {});
  const current = interpolation.defaultVariables as { appName?: string } | undefined;
  if (current?.appName === name) return;
  interpolation.defaultVariables = { ...current, appName: name };
  i18n.emit("languageChanged", i18n.language);
}
