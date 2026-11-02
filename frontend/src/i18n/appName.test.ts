import i18next from "i18next";
import { describe, expect, it } from "vitest";
import { applyAppName } from "./appName";

describe("applyAppName", () => {
  it("reaches texts that are translated after, and without passing it along", async () => {
    const i18n = i18next.createInstance();
    await i18n.init({
      lng: "sv",
      resources: { sv: { translation: { rubrik: "Välkommen till {{appName}}" } } },
      interpolation: { escapeValue: false, defaultVariables: { appName: "EA-portalen" } },
    });
    expect(i18n.t("rubrik")).toBe("Välkommen till EA-portalen");

    let notified = 0;
    i18n.on("languageChanged", () => { notified += 1; });
    applyAppName(i18n, "Arkitekturnavet");
    expect(i18n.t("rubrik")).toBe("Välkommen till Arkitekturnavet");
    expect(notified, "components must render again").toBe(1);

    applyAppName(i18n, "Arkitekturnavet");
    expect(notified, "no render for the same name").toBe(1);
  });
});
