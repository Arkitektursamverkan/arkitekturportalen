import type { SurveyResponseSummary } from "@/api/surveys";
import { csvCell } from "@/utils/changeStats";

/** One person who has been sent the survey and still has something to answer. */
export interface NonRespondent {
  userId: string;
  name: string;
  email: string;
  /** Rows sent to this person that are not answered yet. */
  unanswered: number;
  /** All rows sent to this person, answered or not. */
  sent: number;
  /** Names of the objects the unanswered rows are about (empty for a general send-out). */
  objects: string[];
}

type Row = Pick<
  SurveyResponseSummary,
  "assigned_user_id" | "assigned_user_name" | "assigned_user_email" | "status" | "node_name"
>;

/**
 * The people who have not answered: everyone with at least one row that has
 * been sent out ("pending") but not submitted. One line per person, even when
 * they have a row per application. Rows never sent (draft) are left out — you
 * cannot be late with a survey you never got — and so are rows with no person.
 */
export function nonRespondents(rows: Row[]): NonRespondent[] {
  const byUser = new Map<string, NonRespondent>();
  for (const r of rows) {
    if (r.status === "draft" || !r.assigned_user_id) continue;
    let p = byUser.get(r.assigned_user_id);
    if (!p) {
      p = {
        userId: r.assigned_user_id,
        name: r.assigned_user_name?.trim() ?? "",
        email: r.assigned_user_email?.trim() ?? "",
        unanswered: 0,
        sent: 0,
        objects: [],
      };
      byUser.set(r.assigned_user_id, p);
    }
    p.sent += 1;
    if (r.status === "pending") {
      p.unanswered += 1;
      if (r.node_name) p.objects.push(r.node_name);
    }
  }
  return Array.from(byUser.values())
    .filter((p) => p.unanswered > 0)
    .map((p) => ({ ...p, objects: p.objects.sort((a, b) => a.localeCompare(b, "sv")) }))
    .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, "sv"));
}

/** How many people have been sent the survey at all (the denominator). */
export function sentRecipientCount(rows: Row[]): number {
  return new Set(rows.filter((r) => r.status !== "draft" && r.assigned_user_id).map((r) => r.assigned_user_id)).size;
}

/** Addresses for Outlook's To field: semicolon-separated, each once. */
export function nonRespondentEmails(people: NonRespondent[]): string {
  const byLower = new Map<string, string>();
  for (const p of people) if (p.email) byLower.set(p.email.toLowerCase(), p.email);
  return Array.from(byLower.values()).join("; ");
}

/** Semicolon-separated CSV with a BOM, so that Swedish Excel opens it right. */
export function nonRespondentsCsv(people: NonRespondent[]): string {
  const lines = [
    ["Namn", "E-post", "Obesvarade", "Utskickade", "Obesvarade objekt"],
    ...people.map((p) => [p.name, p.email, p.unanswered, p.sent, p.objects.join(", ")]),
  ];
  return "﻿" + lines.map((l) => l.map(csvCell).join(";")).join("\r\n") + "\r\n";
}
