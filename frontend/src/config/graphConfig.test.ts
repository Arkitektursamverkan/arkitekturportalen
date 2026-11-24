import { describe, expect, it } from "vitest";
import { getValidEdgeTypes, getValidTargetTypes } from "./graphConfig";

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
