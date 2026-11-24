import { describe, expect, it } from "vitest";
import { edgeDescriptionKey, edgeTypeKey, getValidEdgeTypes, getValidTargetTypes } from "./graphConfig";

describe("kopplingar mellan applikationer", () => {
  it("en applikation kan integrera med eller innehålla en annan (komponent)", () => {
    expect(getValidEdgeTypes("Application", "Application")).toEqual(["INTEGRATES_WITH", "CONTAINS"]);
  });

  it("integration är fortfarande förvalet", () => {
    expect(getValidEdgeTypes("Application", "Application")[0]).toBe("INTEGRATES_WITH");
  });

  it("applikationen kan fortfarande innehålla en informationskälla", () => {
    expect(getValidEdgeTypes("Application", "InformationSource")).toEqual(["CONTAINS"]);
    expect(getValidTargetTypes("Application")).toContain("Application");
  });
});

describe("kopplingens namn", () => {
  it("applikation → applikation heter Har komponent, sett från komponenten Ingår i", () => {
    expect(edgeTypeKey("CONTAINS", "Application", "Application")).toBe("edgeTypes.HAS_COMPONENT");
    expect(edgeTypeKey("CONTAINS", "Application", "Application", true)).toBe("edgeTypes.PART_OF");
  });

  it("övriga kopplingar behåller sitt namn", () => {
    expect(edgeTypeKey("CONTAINS", "Application", "InformationSource")).toBe("edgeTypes.CONTAINS");
    expect(edgeTypeKey("INTEGRATES_WITH", "Application", "Application")).toBe("edgeTypes.INTEGRATES_WITH");
    expect(edgeTypeKey("CONTAINS")).toBe("edgeTypes.CONTAINS");
  });
});

describe("kopplingens beskrivning", () => {
  it("komponenten får sin egen beskrivning, andra kopplingar sin typs", () => {
    expect(edgeDescriptionKey("CONTAINS", "Application", "Application")).toBe("edgeTypeDescriptions.HAS_COMPONENT");
    expect(edgeDescriptionKey("CONTAINS", "Application", "InformationSource")).toBe("edgeTypeDescriptions.CONTAINS");
  });
});
