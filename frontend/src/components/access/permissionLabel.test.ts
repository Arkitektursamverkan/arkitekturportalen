import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import { permissionLabel } from "./accessParts";
import type { AccessMeta } from "@/api/access";

const t = ((key: string, opts?: Record<string, string>) => (opts?.name ? `${key}:${opts.name}` : key)) as unknown as TFunction;
const meta: AccessMeta = {
  permissions: ["object.read"],
  node_types: [],
  principal_roles: [],
  classifications: [{ id: "kansliga", name: "Känsliga personuppgifter", levels: ["Nivå 3"] }],
};

describe("permissionLabel", () => {
  it("names a fixed permission from the translations", () => {
    expect(permissionLabel("object.read", t, meta)).toBe("access.permissions.object.read");
  });
  it("names a protection class by its own name – or its id when no picture requires it now", () => {
    expect(permissionLabel("classified.kansliga", t, meta)).toBe("access.classified.permission:Känsliga personuppgifter");
    expect(permissionLabel("classified.gammal", t, meta)).toBe("access.classified.permission:gammal");
  });
});
