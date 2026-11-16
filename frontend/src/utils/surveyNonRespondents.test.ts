import { describe, expect, it } from "vitest";
import { nonRespondentEmails, nonRespondents, nonRespondentsCsv, sentRecipientCount } from "./surveyNonRespondents";

const row = (user: string | null, status: "draft" | "pending" | "submitted" | "reviewed", node: string | null = null) => ({
  assigned_user_id: user,
  assigned_user_name: user ? `Namn ${user}` : null,
  assigned_user_email: user ? `${user}@example.org` : null,
  status,
  node_name: node,
});

describe("nonRespondents", () => {
  it("tar med den som fått enkäten men inte svarat, en rad per person", () => {
    const people = nonRespondents([
      row("b", "pending", "Lön"),
      row("b", "pending", "Arkiv"),
      row("b", "submitted", "Ekonomi"),
      row("a", "pending"),
    ]);
    expect(people.map((p) => p.userId)).toEqual(["a", "b"]);
    expect(people[1]).toMatchObject({ unanswered: 2, sent: 3, objects: ["Arkiv", "Lön"] });
    expect(people[0]).toMatchObject({ unanswered: 1, sent: 1, objects: [] });
  });

  it("utelämnar den som svarat på allt, utkast och rader utan person", () => {
    const people = nonRespondents([
      row("klar", "submitted"),
      row("granskad", "reviewed"),
      row("ej-utskickad", "draft"),
      row(null, "pending", "Omatchad"),
    ]);
    expect(people).toEqual([]);
  });

  it("räknar hur många som fått enkäten", () => {
    expect(sentRecipientCount([row("a", "pending"), row("a", "submitted"), row("b", "reviewed"), row("c", "draft"), row(null, "pending")])).toBe(2);
  });
});

describe("utdata", () => {
  const people = nonRespondents([row("b", "pending", "Lön; \"nya\""), row("a", "pending")]);

  it("ger adresserna med semikolon emellan", () => {
    expect(nonRespondentEmails(people)).toBe("a@example.org; b@example.org");
  });

  it("ger en CSV med BOM, semikolon och citerade celler", () => {
    const csv = nonRespondentsCsv(people);
    expect(csv.startsWith("﻿\"Namn\";\"E-post\";\"Obesvarade\";\"Utskickade\";\"Obesvarade objekt\"\r\n")).toBe(true);
    expect(csv).toContain("\"Namn b\";\"b@example.org\";\"1\";\"1\";\"Lön; \"\"nya\"\"\"\r\n");
  });

  it("oskadliggör celler som ser ut som formler", () => {
    const csv = nonRespondentsCsv([{ userId: "x", name: "=CMD()", email: "x@example.org", unanswered: 1, sent: 1, objects: [] }]);
    expect(csv).toContain("\"'=CMD()\"");
  });
});
