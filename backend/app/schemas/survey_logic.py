"""Shared branch-walking logic for surveys with conditional question flow.

Mirrors `frontend/src/utils/surveyFlow.ts` — the two must stay in sync so that
what a respondent is shown matches what the backend considers "required".
"""
from __future__ import annotations

from typing import Any

END_SURVEY = "__end__"


def is_empty_answer(value: Any) -> bool:
    return value is None or value == "" or value == []


def match_rule(rule: dict[str, Any], value: Any) -> bool:
    op = rule.get("op", "eq")
    rule_value: Any = rule.get("value")
    if value is None:
        return False
    if op == "eq":
        if isinstance(value, list):
            return rule_value in value
        return value == rule_value
    try:
        numeric_value = float(value)
        numeric_rule = float(rule_value)
    except (TypeError, ValueError):
        return False
    if op == "gte":
        return numeric_value >= numeric_rule
    if op == "lte":
        return numeric_value <= numeric_rule
    return False


def compute_visible_question_ids(
    questions: list[dict[str, Any]], answers: dict[str, Any]
) -> tuple[list[str], bool]:
    """Walk questions from the start following branch rules.

    Returns (visible_question_ids, ended_early). Walking stops once a
    branching question hasn't been answered yet — everything after it is
    not yet "visible" to the respondent, so it must not be treated as
    required either.
    """
    if not questions:
        return [], False

    by_id = {q["id"]: q for q in questions if q.get("id")}
    order = [q["id"] for q in questions if q.get("id")]
    if not order:
        return [], False

    visible: list[str] = []
    seen: set[str] = set()
    current_id: str | None = order[0]

    while current_id and current_id not in seen:
        seen.add(current_id)
        visible.append(current_id)
        question = by_id.get(current_id)
        if question is None:
            break

        idx = order.index(current_id)
        next_in_order = order[idx + 1] if idx + 1 < len(order) else None
        branches = question.get("branches") or []
        default_goto = question.get("default_goto")

        if branches:
            value = answers.get(current_id)
            if is_empty_answer(value):
                return visible, False
            matched = next((r.get("goto") for r in branches if match_rule(r, value)), None)
            goto = matched or default_goto or next_in_order
        else:
            # default_goto works as an unconditional "continue to" override even
            # for non-branching questions — needed so a question reached via a
            # branch (e.g. a plain text follow-up) can redirect flow onward to a
            # convergence point instead of silently falling into the next array
            # item, which may belong to a sibling branch and would re-merge it.
            goto = default_goto or next_in_order

        if goto == END_SURVEY:
            return visible, True
        current_id = goto

    return visible, False


def _without_report_tags(questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    # Null-valued keys are dropped so a question stored before a field existed
    # compares equal to the same question round-tripped through the current
    # schema, which fills the missing field with None.
    return [
        {k: v for k, v in q.items() if k != "reports" and v is not None}
        for q in questions
    ]


def questions_differ_beyond_reports(
    existing: list[dict[str, Any]], incoming: list[dict[str, Any]]
) -> bool:
    """True if anything but the report tags differs between two question lists.

    Lets an admin re-tag questions for reporting on a survey that has already
    collected answers, while the wording and options respondents saw stay
    frozen.
    """
    return _without_report_tags(existing) != _without_report_tags(incoming)


def validate_report_definitions(
    questions: list[dict[str, Any]],
    reports: list[dict[str, Any]],
    valid_slots: tuple[int, ...],
) -> None:
    """Raise ValueError on report tags or conditions that point nowhere."""
    question_ids = {q.get("id") for q in questions if q.get("id")}

    for question in questions:
        for slot in question.get("reports") or []:
            if slot not in valid_slots:
                raise ValueError(
                    f"Fråga \"{question.get('label', question.get('id'))}\" är märkt med en okänd rapport"
                )

    seen: set[int] = set()
    for report in reports:
        number: Any = report.get("number")
        if number in seen:
            raise ValueError(f"Rapport {number} är definierad mer än en gång")
        seen.add(number)
        for condition in report.get("conditions") or []:
            if condition.get("question_id") not in question_ids:
                raise ValueError(
                    f"Rapport {number} har ett villkor som pekar på en fråga som inte finns"
                )


def validate_branch_targets(questions: list[dict[str, Any]]) -> None:
    """Raise ValueError if any branch/default target doesn't reference a real
    question id (or the END_SURVEY sentinel)."""
    valid_ids = {q.get("id") for q in questions if q.get("id")}
    valid_ids.add(END_SURVEY)
    for question in questions:
        for rule in question.get("branches") or []:
            goto = rule.get("goto")
            if goto not in valid_ids:
                raise ValueError(
                    f"Fråga \"{question.get('label', question.get('id'))}\" har en förgrening till en okänd fråga"
                )
        default_goto = question.get("default_goto")
        if default_goto is not None and default_goto not in valid_ids:
            raise ValueError(
                f"Fråga \"{question.get('label', question.get('id'))}\" har en ogiltig standardförgrening"
            )
