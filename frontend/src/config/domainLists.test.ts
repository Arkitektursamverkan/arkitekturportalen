import { describe, expect, it } from "vitest";
import { isOwnField, listPathEnabled, ownFieldKey, ownFieldLabel, ownFieldsFor, slug, type DomainLists } from "./domainLists";

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

describe("own fields", () => {
  const withFields: DomainLists = {
    ...lists,
    extra_fields: {
      nodes: { Application: [{ key: "x_avtal", label: "Avtal", type: "text", options: [] }] },
      edges: { INTEGRATES_WITH: [{ key: "x_integrationstyp", label: "Integrationstyp", type: "choice", options: ["REST"] }] },
    },
  };

  it("makes a key the backend accepts: prefixed, underscores, never one that is taken", () => {
    expect(ownFieldKey("Integrationstyp (API)", [])).toBe("x_integrationstyp_api");
    expect(ownFieldKey("Avtal", ["x_avtal"])).toBe("x_avtal_2");
    expect(ownFieldKey("Ä".repeat(80), [])).toMatch(/^x_[a-z0-9][a-z0-9_-]{0,46}$/);
  });

  it("finds a type's fields, and none in a setting from before own fields", () => {
    expect(ownFieldsFor(withFields, "edges", "INTEGRATES_WITH").map((f) => f.label)).toEqual(["Integrationstyp"]);
    expect(ownFieldsFor(withFields, "edges", "USES")).toEqual([]);
    expect(ownFieldsFor(lists, "nodes", "Application")).toEqual([]);
    expect(ownFieldsFor(undefined, "nodes", "Application")).toEqual([]);
  });

  it("names an own field by its label, and leaves built-in attributes to the translations", () => {
    expect(ownFieldLabel(withFields, "x_avtal")).toBe("Avtal");
    expect(ownFieldLabel(withFields, "x_borttaget")).toBeUndefined();
    expect(ownFieldLabel(withFields, "direction")).toBeUndefined();
    expect(isOwnField("x_avtal")).toBe(true);
    expect(isOwnField("direction")).toBe(false);
  });
});
