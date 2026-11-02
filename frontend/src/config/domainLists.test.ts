import { describe, expect, it } from "vitest";
import { listPathEnabled, slug, type DomainLists } from "./domainLists";

const lists: DomainLists = {
  disabled: ["Server"],
  custom: [
    { key: "lev", name: "Leverantörer", domain: "application", active: true, fields: [] },
    { key: "av", name: "Avstängd", domain: "technology", active: false, fields: [] },
  ],
};

describe("listPathEnabled", () => {
  it("everything is on until the settings say otherwise", () => {
    expect(listPathEnabled("/servers", undefined)).toBe(true);
    expect(listPathEnabled("/servers", { disabled: [], custom: [] })).toBe(true);
  });

  it("closes a switched-off list's page, also from a bookmark", () => {
    expect(listPathEnabled("/servers", lists)).toBe(false);
    expect(listPathEnabled("/server-services", lists)).toBe(true);
    expect(listPathEnabled("/lists/av", lists)).toBe(false);
    expect(listPathEnabled("/lists/finns-inte", lists)).toBe(false);
    expect(listPathEnabled("/lists/lev", lists)).toBe(true);
  });

  it("leaves other pages alone", () => {
    expect(listPathEnabled("/systems", lists)).toBe(true);
    expect(listPathEnabled("/", lists)).toBe(true);
  });
});

describe("slug", () => {
  it("makes a key the backend accepts, and never one that is taken", () => {
    expect(slug("Avtal & Överenskommelser", [])).toBe("avtal-overenskommelser");
    expect(slug("Avtal", ["avtal"])).toBe("avtal-2");
    expect(slug("???", [])).toBe("lista");
  });
});
