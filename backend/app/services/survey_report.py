"""Compile a numbered report out of a survey's answers.

A report is two things chosen by the survey author, both editable after
publication: the questions tagged with the report's number, and the
conditions a response has to meet to be counted. The questions a condition
selects on are shown too, without needing a tag.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.schemas.survey_logic import is_empty_answer, match_rule
from app.services.survey_export import (
    OBJECT_WORD,
    format_answer,
    format_datetime,
    render_question_label,
)

_OP_LABEL = {
    "eq": "är",
    "gte": "är minst",
    "lte": "är högst",
    "answered": "är besvarad",
}


def _condition_matches(condition: dict[str, Any], answers: dict[str, Any]) -> bool:
    value = answers.get(condition.get("question_id", ""))
    if condition.get("op") == "answered":
        return not is_empty_answer(value)
    if is_empty_answer(value):
        return False
    return match_rule({"op": condition.get("op", "eq"), "value": condition.get("value")}, value)


def _condition_groups(conditions: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    """Split conditions into the alternatives an "or" separates.

    "and" binds tighter than "or", so A and B or C becomes [[A, B], [C]] —
    the same reading as everywhere else conditions are written down.
    """
    groups: list[list[dict[str, Any]]] = []
    for condition in conditions:
        if not groups or condition.get("join") == "or":
            groups.append([])
        groups[-1].append(condition)
    return groups


def response_matches_report(report: dict[str, Any], response: dict[str, Any]) -> bool:
    """One alternative has to hold in full. No conditions = every response."""
    conditions = report.get("conditions") or []
    if not conditions:
        return True
    answers = response.get("answers") or {}
    return any(
        all(_condition_matches(c, answers) for c in group)
        for group in _condition_groups(conditions)
    )


def find_report(survey: Any, number: int) -> dict[str, Any] | None:
    for report in survey.reports or []:
        if report.get("number") == number:
            return report
    return None


def report_questions(survey: Any, number: int) -> list[dict[str, Any]]:
    """The questions a report shows, in the order they appear in the survey.

    Two sources: the questions tagged with the report's number, and the ones
    its conditions are built on. The latter come along without being tagged —
    a report that selects on an answer is nearly always meant to show it, and
    leaving it out reads as if the selection never took effect.
    """
    report = find_report(survey, number) or {}
    condition_ids = {c.get("question_id") for c in report.get("conditions") or []}
    return [
        q
        for q in (survey.questions or [])
        if number in (q.get("reports") or []) or q.get("id") in condition_ids
    ]


def _describe_condition(condition: dict[str, Any], questions: list[dict[str, Any]], object_word: str) -> str:
    question = next((q for q in questions if q.get("id") == condition.get("question_id")), None)
    label = render_question_label(question, object_word) if question else condition.get("question_id", "")
    op = condition.get("op", "eq")
    if op == "answered":
        return f"{label} är besvarad"
    value = condition.get("value")
    if isinstance(value, bool):
        value_label = "Ja" if value else "Nej"
    else:
        value_label = str(value)
    return f"{label} {_OP_LABEL.get(op, op)} {value_label}"


def _describe_conditions(
    conditions: list[dict[str, Any]], questions: list[dict[str, Any]], object_word: str
) -> list[str]:
    """One line per condition, each carrying the operator that joins it to the
    one above — so a reader of the report sees the same logic the editor shows."""
    out = []
    for index, condition in enumerate(conditions):
        text = _describe_condition(condition, questions, object_word)
        if index:
            text = f"{'eller' if condition.get('join') == 'or' else 'och'} {text}"
        out.append(text)
    return out


def compile_report(
    survey: Any,
    responses: list[dict[str, Any]],
    node_names: dict[str, str],
    number: int,
) -> dict[str, Any]:
    """Build the full report payload — used by the on-screen view, the CSV and the PDF."""
    report = find_report(survey, number) or {"number": number, "name": "", "conditions": []}
    questions = report_questions(survey, number)
    object_word = OBJECT_WORD.get(survey.target_node_type, "objektet")

    answered = [r for r in responses if r["status"] in ("submitted", "reviewed")]
    matching = [r for r in answered if response_matches_report(report, r)]
    matching.sort(key=lambda r: (r.get("node_name") or "").lower())
    # Stripped here rather than at display time, so a CSV, a PDF and a
    # published edition can never carry a name the report is meant to hide.
    anonymous = report.get("anonymous", True)

    rows = []
    for response in matching:
        answers = response.get("answers") or {}
        rows.append({
            "response_id": str(response["id"]),
            "object_name": response.get("node_name") or "",
            "recipient": "" if anonymous else (response.get("assigned_user_name") or ""),
            "submitted_by": "" if anonymous else (response.get("submitted_by") or ""),
            "submitted_at": format_datetime(response.get("submitted_at")),
            "answers": {
                str(q.get("id")): format_answer(answers.get(q.get("id")), q, node_names)
                for q in questions
            },
        })

    return {
        "number": number,
        "name": report.get("name") or f"Rapport {number}",
        "anonymous": anonymous,
        "survey_id": str(survey.id),
        "survey_title": survey.title,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "conditions": _describe_conditions(
            report.get("conditions") or [], survey.questions or [], object_word
        ),
        "questions": [
            {
                "id": str(q.get("id")),
                "label": render_question_label(q, object_word),
                "type": q.get("type"),
            }
            for q in questions
        ],
        "rows": rows,
        "answered_count": len(answered),
        "matching_count": len(matching),
    }


def available_reports(survey: Any, responses: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Every report slot that is in use — defined, or with questions tagged to it."""
    answered = [r for r in responses if r["status"] in ("submitted", "reviewed")]
    defined = {r.get("number"): r for r in (survey.reports or [])}
    tagged: set[int] = {
        slot for q in (survey.questions or []) for slot in (q.get("reports") or [])
    }

    out = []
    for number in sorted(set(defined) | tagged):
        report = defined.get(number, {"number": number, "name": "", "conditions": []})
        out.append({
            "number": number,
            "name": report.get("name") or f"Rapport {number}",
            "question_count": len(report_questions(survey, number)),
            "matching_count": sum(1 for r in answered if response_matches_report(report, r)),
        })
    return out
