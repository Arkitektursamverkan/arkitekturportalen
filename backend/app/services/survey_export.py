"""CSV export of survey responses — one row per answered response.

Written for Excel in Swedish locale: semicolon-separated, CRLF, and served
with a UTF-8 BOM so that åäö survive a double-click open.
"""
from __future__ import annotations

import io
import re
import unicodedata
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.csv_safety import safe_writer

CSV_DELIMITER = ";"

try:
    _LOCAL_TZ: Any = ZoneInfo("Europe/Stockholm")
except ZoneInfoNotFoundError:  # pragma: no cover — no tzdata in the image
    _LOCAL_TZ = UTC

_STATUS_LABEL = {
    "draft": "Utkast",
    "pending": "Väntar svar",
    "submitted": "Inskickad",
    "reviewed": "Granskad",
}

# A column header is shared by every row, so the per-response {{system_name}}
# variable has to resolve to a generic word for the survey's target type.
OBJECT_WORD = {
    "Application": "applikationen",
    "Process": "processen",
    "InformationObject": "informationsobjektet",
    "InformationSource": "informationskällan",
    "TechnologyComponent": "teknikkomponenten",
}

_VARIABLE_RE = re.compile(r"\{\{\s*([a-zA-Z_]\w*)\s*\}\}")


def _render_label(text: str, object_word: str) -> str:
    return _VARIABLE_RE.sub(
        lambda m: object_word if m.group(1) == "system_name" else m.group(0), text
    )


def render_question_label(question: dict[str, Any], object_word: str) -> str:
    """A question's text with merge variables resolved to a generic word."""
    qid = str(question.get("id") or "")
    return _render_label(str(question.get("label") or qid), object_word)


def format_datetime(value: datetime | None) -> str:
    if value is None:
        return ""
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(_LOCAL_TZ).strftime("%Y-%m-%d %H:%M")


def _matrix(response: dict[str, Any], question_id: str) -> dict[str, Any]:
    value = (response.get("answers") or {}).get(question_id)
    return value if isinstance(value, dict) else {}


def format_answer(
    value: Any,
    question: dict[str, Any] | None,
    node_names: dict[str, str],
) -> str:
    if value is None or value == "":
        return ""
    if isinstance(value, bool):
        return "Ja" if value else "Nej"
    if isinstance(value, list):
        # system_picker answers hold node ids — export the names instead.
        if question is not None and question.get("type") == "system_picker":
            return ", ".join(node_names.get(str(v), str(v)) for v in value)
        return ", ".join("" if v is None else str(v) for v in value)
    if isinstance(value, dict):
        # A matrix answer whose question definition is gone.
        return ", ".join(f"{k}: {v}" for k, v in value.items())
    return str(value)


def build_responses_csv(
    survey: Any,
    responses: list[dict[str, Any]],
    node_names: dict[str, str],
    questions: list[dict[str, Any]] | None = None,
    anonymous: bool = False,
) -> str:
    """Render one CSV row per response, with one column per question.

    Rating-matrix questions expand to one column per parameter so the values
    stay numeric and sortable in a spreadsheet. `questions` narrows the export
    to a subset — used by report exports, which cover only tagged questions.
    `anonymous` drops the columns naming the respondent.
    """
    is_subset = questions is not None
    questions = list(questions if questions is not None else (survey.questions or []))
    object_word = OBJECT_WORD.get(survey.target_node_type, "objektet")
    question_ids = {q.get("id") for q in questions}

    columns: list[tuple[str, Callable[[dict[str, Any]], str]]] = [
        ("Objekt", lambda r: r.get("node_name") or ""),
    ]
    if not anonymous:
        columns += [
            ("Mottagare", lambda r: r.get("assigned_user_name") or ""),
            ("E-post", lambda r: r.get("assigned_user_email") or ""),
        ]
    columns.append(
        ("Status", lambda r: _STATUS_LABEL.get(r.get("status", ""), r.get("status", "")))
    )
    if not anonymous:
        columns.append(("Inskickad av", lambda r: r.get("submitted_by") or ""))
    columns += [
        ("Inskickad", lambda r: format_datetime(r.get("submitted_at"))),
        # The reviewer is an admin reading the answers, not the respondent —
        # anonymising the report does not hide who granskade it.
        ("Granskad av", lambda r: r.get("reviewed_by") or ""),
        ("Granskad", lambda r: format_datetime(r.get("reviewed_at"))),
    ]

    # Factories rather than default-argument lambdas, so each column binds its
    # own question and mypy can infer the callable type.
    def matrix_cell(qid: str, row: str) -> Callable[[dict[str, Any]], str]:
        return lambda r: format_answer(_matrix(r, qid).get(row), None, node_names)

    def answer(qid: str, q: dict[str, Any] | None) -> Callable[[dict[str, Any]], str]:
        return lambda r: format_answer((r.get("answers") or {}).get(qid), q, node_names)

    for question in questions:
        qid = str(question.get("id") or "")
        label = _render_label(str(question.get("label") or qid), object_word)
        rows = question.get("rows") or []
        if question.get("type") == "rating_matrix" and rows:
            for row in rows:
                columns.append((f"{label} — {row}", matrix_cell(qid, row)))
        else:
            columns.append((label, answer(qid, question)))

    # Answers to questions that were deleted after the fact would otherwise
    # disappear silently — keep them in trailing columns. A report export is
    # deliberately narrow, so untagged answers are left out there.
    orphans = [] if is_subset else sorted(
        {qid for r in responses for qid in (r.get("answers") or {}) if qid not in question_ids}
    )
    for qid in orphans:
        columns.append((f"Borttagen fråga: {qid}", answer(qid, None)))

    buf = io.StringIO()
    writer = safe_writer(buf, delimiter=CSV_DELIMITER, lineterminator="\r\n")
    writer.writerow([header for header, _ in columns])
    for response in responses:
        writer.writerow([extract(response) for _, extract in columns])
    return buf.getvalue()


def build_report_csv(report: dict[str, Any]) -> str:
    """One CSV row per report row, from an already compiled report.

    Works off the payload alone — a published report has no live responses to
    read back, and the answers in it are formatted strings already.
    """
    questions = report.get("questions") or []
    anonymous = report.get("anonymous", True)
    columns = ["Objekt"]
    if not anonymous:
        columns += ["Mottagare", "Inskickad av"]
    columns.append("Inskickad")
    columns += [str(q.get("label") or q.get("id") or "") for q in questions]

    buf = io.StringIO()
    writer = safe_writer(buf, delimiter=CSV_DELIMITER, lineterminator="\r\n")
    writer.writerow(columns)
    for row in report.get("rows") or []:
        answers = row.get("answers") or {}
        writer.writerow([
            row.get("object_name") or "",
            *([] if anonymous else [row.get("recipient") or "", row.get("submitted_by") or ""]),
            row.get("submitted_at") or "",
            *[answers.get(str(q.get("id")), "") for q in questions],
        ])
    return buf.getvalue()


def export_filename(
    title: str,
    now: datetime,
    *,
    prefix: str = "enkatsvar",
    extension: str = "csv",
) -> str:
    """ASCII-safe filename — Content-Disposition is latin-1 encoded."""
    ascii_title = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^A-Za-z0-9]+", "_", ascii_title).strip("_").lower() or "enkat"
    return f"{prefix}_{slug}_{now.strftime('%Y%m%d')}.{extension}"
