import { describe, expect, it } from "vitest";
import { namesIn, peopleWithRoles } from "./personRoles";

const node = (id: string, type: string, attributes: Record<string, unknown>, archived = false) =>
  ({ id, name: `Objekt ${id}`, type, attributes, archived });

describe("roller per person", () => {
  it("delar upp flera namn i samma fält", () => {
    expect(namesIn("Anna  Ek; Bo Al,Cia Ek / Dan Ek")).toEqual(["Anna Ek", "Bo Al", "Cia Ek", "Dan Ek"]);
    expect(namesIn("")).toEqual([]);
    expect(namesIn(42)).toEqual([]);
  });

  it("samlar en persons roller över objekt och objekttyper", () => {
    const people = peopleWithRoles([
      node("1", "Application", { systemägare: "Anna Ek", systemförvaltare: "anna ek", systemadministratör: "Bo Al" }),
      node("2", "Application", { systemadministratör: "Anna Ek, Bo Al", kategori: "Anna Ek" }),
      node("3", "ServerService", { ansvarig: "Anna Ek" }),
      node("4", "Application", { systemägare: "Anna Ek" }, true),
    ]);
    expect(people.map((p) => p.name)).toEqual(["Anna Ek", "Bo Al"]);
    const anna = people[0];
    // Det arkiverade objektet och fält som inte är roller räknas inte.
    expect(anna.objects.map((o) => [o.node_id, o.roles])).toEqual([
      ["1", ["systemägare", "systemförvaltare"]],
      ["2", ["systemadministratör"]],
      ["3", ["ansvarig"]],
    ]);
    expect(anna.perRole).toEqual({ systemägare: 1, systemförvaltare: 1, systemadministratör: 1, ansvarig: 1 });
    expect(people[1].perRole).toEqual({ systemadministratör: 2 });
  });

  it("räknar en roll en gång per objekt även om namnet står två gånger", () => {
    const [p] = peopleWithRoles([node("1", "Application", { systemägare: "Anna Ek; Anna Ek" })]);
    expect(p.perRole).toEqual({ systemägare: 1 });
    expect(p.objects).toHaveLength(1);
  });
});
