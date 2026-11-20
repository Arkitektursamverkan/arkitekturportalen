import { describe, expect, it } from "vitest";
import { detailText } from "./client";

describe("API:ts felbesked", () => {
  it("lämnar en text som den är", () => {
    expect(detailText("Namnet Vendor är redan en annan kolumn")).toBe("Namnet Vendor är redan en annan kolumn");
    expect(detailText("")).toBeUndefined();
    expect(detailText(undefined)).toBeUndefined();
  });

  it("plockar skälen ur en lista med avvisade fält", () => {
    expect(detailText([
      { type: "value_error", loc: ["body", "field_labels", "nodes"], msg: "Value error, Två fält på samma objekttyp har fått samma namn" },
    ])).toBe("Två fält på samma objekttyp har fått samma namn");
    expect(detailText([{ msg: "Field required" }, { msg: "Value error, Okänd objekttyp: X" }])).toBe("Field required Okänd objekttyp: X");
    expect(detailText([{}])).toBeUndefined();
    expect(detailText({ något: "annat" })).toBeUndefined();
  });
});
