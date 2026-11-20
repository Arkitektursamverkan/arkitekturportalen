import { describe, expect, it } from "vitest";
import { renamedField, renamedFieldAnyType, type DomainLists } from "./domainLists";

const lists = (nodes: Record<string, Record<string, string>>): DomainLists => ({
  disabled: [], custom: [], field_labels: { nodes },
});

describe("fältens egna namn", () => {
  it("ger namnet för objekttypen, annars inget", () => {
    const l = lists({ Application: { systemägare: "Avtalsägare" } });
    expect(renamedField(l, "Application", "systemägare")).toBe("Avtalsägare");
    expect(renamedField(l, "Application", "status")).toBeUndefined();
    expect(renamedField(l, "Process", "systemägare")).toBeUndefined();
    expect(renamedField(undefined, "Application", "systemägare")).toBeUndefined();
    // En inställning sparad före namnbytena fanns.
    expect(renamedField({ disabled: [], custom: [] }, "Application", "systemägare")).toBeUndefined();
  });

  it("utan objekttyp gäller namnet bara när typerna är överens", () => {
    expect(renamedFieldAnyType(lists({ Application: { leverantör: "Tillverkare" } }), "leverantör")).toBe("Tillverkare");
    expect(renamedFieldAnyType(
      lists({ Application: { leverantör: "Tillverkare" }, TechnologyComponent: { leverantör: "Tillverkare" } }), "leverantör",
    )).toBe("Tillverkare");
    expect(renamedFieldAnyType(
      lists({ Application: { leverantör: "Tillverkare" }, TechnologyComponent: { leverantör: "Säljare" } }), "leverantör",
    )).toBeUndefined();
    expect(renamedFieldAnyType(lists({}), "leverantör")).toBeUndefined();
  });
});
