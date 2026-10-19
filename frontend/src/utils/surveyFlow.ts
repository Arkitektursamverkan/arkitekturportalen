import type { Question } from "@/api/surveys";

// Mirrors backend/app/schemas/survey_logic.py — keep both in sync.

export const END_SURVEY = "__end__";

export type BranchOp = "eq" | "gte" | "lte";

export interface BranchRule {
  op?: BranchOp;
  value: unknown;
  goto: string;
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

function matchRule(rule: BranchRule, value: unknown): boolean {
  const op = rule.op ?? "eq";
  if (value === undefined || value === null) return false;
  if (op === "eq") {
    if (Array.isArray(value)) return value.includes(rule.value as never);
    return value === rule.value;
  }
  const numValue = Number(value);
  const numRule = Number(rule.value);
  if (Number.isNaN(numValue) || Number.isNaN(numRule)) return false;
  if (op === "gte") return numValue >= numRule;
  if (op === "lte") return numValue <= numRule;
  return false;
}

/**
 * Walks questions from the start, following branch rules, to determine which
 * questions the respondent should currently see. Stops (without ending) at
 * the first unanswered branching question — later questions aren't
 * "visible" yet.
 */
export function computeVisiblePath(
  questions: Question[],
  answers: Record<string, unknown>,
): { visibleIds: string[]; ended: boolean } {
  if (questions.length === 0) return { visibleIds: [], ended: false };
  const byId = new Map(questions.map((q) => [q.id, q]));
  const order = questions.map((q) => q.id);
  const visible: string[] = [];
  const seen = new Set<string>();
  let currentId: string | undefined = order[0];

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    visible.push(currentId);
    const question = byId.get(currentId);
    if (!question) break;

    const idx = order.indexOf(currentId);
    const nextInOrder = idx + 1 < order.length ? order[idx + 1] : undefined;
    const branches = (question.branches as BranchRule[] | undefined) ?? [];
    const defaultGoto = question.default_goto ?? undefined;

    let goto: string | undefined;
    if (branches.length > 0) {
      const value: unknown = answers[currentId];
      if (isEmpty(value)) return { visibleIds: visible, ended: false };
      const matched: BranchRule | undefined = branches.find((r) => matchRule(r, value));
      goto = matched?.goto ?? defaultGoto ?? nextInOrder;
    } else {
      // default_goto is an unconditional "continue to" override, available on
      // every question type — needed so a plain question reached via a branch
      // can redirect onward to a convergence point instead of silently
      // falling into the next array item, which may belong to a sibling
      // branch and would re-merge the paths.
      goto = defaultGoto ?? nextInOrder;
    }
    if (goto === END_SURVEY) return { visibleIds: visible, ended: true };
    currentId = goto;
  }
  return { visibleIds: visible, ended: false };
}
