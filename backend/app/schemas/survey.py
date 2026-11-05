"""Schemas for admin-authored surveys ("enkäter")."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.shared_links import check_link_url

SurveyStatus = Literal["draft", "open", "paused", "closed"]
# standard: resolved recipients + launch. random_system: logged-in users are
# offered a randomly picked system to answer about (no pre-resolution).
SurveyKind = Literal["standard", "random_system"]
QuestionType = Literal["text", "yes_no", "multiple_choice", "system_picker", "rating", "rating_matrix"]
BranchOp = Literal["eq", "gte", "lte"]
# "answered" matches any non-empty answer — the rest mirror BranchOp.
ReportOp = Literal["eq", "gte", "lte", "answered"]
# How a condition joins the one before it. "and" binds tighter than "or",
# so A and B or C reads as (A and B) or C.
ReportJoin = Literal["and", "or"]

# Reports are fixed, numbered slots. Five is enough to keep the tag a simple
# pick-list on every question while covering the ways a survey gets read.
REPORT_SLOTS = (1, 2, 3, 4, 5)


class BranchRule(BaseModel):
    op: BranchOp = "eq"
    value: Any
    # Target question id, or the "__end__" sentinel to end the survey early.
    goto: str = Field(..., min_length=1)


class ReportCondition(BaseModel):
    """One filter on a report: a response is included only when its answer to
    `question_id` matches.

    `join` is the operator to the condition before it — conditions are ANDed
    unless one joins with "or". Ignored on the first condition.
    """
    question_id: str = Field(..., min_length=1)
    op: ReportOp = "eq"
    value: Any = None
    join: ReportJoin = "and"


class ReportDefinition(BaseModel):
    number: int = Field(..., ge=1, le=len(REPORT_SLOTS))
    # Free-text heading, e.g. "Integrationsbehov". Falls back to "Rapport N".
    name: str = Field("", max_length=200)
    conditions: list[ReportCondition] = Field(default_factory=list)
    # Leave out who answered — the object and the answers stay, the person
    # does not. On by default, including for reports saved before the flag
    # existed: a report is about what was answered, not about who answered.
    anonymous: bool = True


class Question(BaseModel):
    id: str = Field(..., min_length=1, max_length=100)
    type: QuestionType
    label: str = Field(..., min_length=1, max_length=500)
    help_text: str | None = None
    required: bool = False
    # multiple_choice
    options: list[str] | None = None
    allow_multiple: bool | None = None
    # system_picker
    node_type_filter: str | None = None
    # rating_matrix: the parameters ("Användarvänlighet", …) each rated on
    # the shared scale below; the answer is {row label: chosen value}.
    rows: list[str] | None = None
    # rating (and the scale shared by rating_matrix)
    scale_min: int | None = None
    scale_max: int | None = None
    scale_min_label: str | None = None
    scale_max_label: str | None = None
    scale_min_emoji: str | None = None
    scale_max_emoji: str | None = None
    # branching: evaluated against this question's own answer to pick the
    # next question to show. First matching rule wins; if none match,
    # default_goto is used, falling back to the next question in list order.
    branches: list[BranchRule] | None = None
    default_goto: str | None = None
    # Report slots this question's answers are included in (empty/None = none).
    # Optional for the survey author, and editable after publication.
    reports: list[int] | None = None


def _answer_url(v: str | None) -> str | None:
    """Blank = the built-in form; otherwise a web address or a path on this server."""
    v = (v or "").strip()
    return check_link_url(v) if v else None


class SurveyCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str = ""
    kind: SurveyKind = "standard"
    target_node_type: str = "Application"
    target_attribute_key: str = "systemförvaltare"
    questions: list[Question] = Field(default_factory=list)
    reports: list[ReportDefinition] = Field(default_factory=list)
    allow_multiple_responses: bool = False
    due_date: date | None = None
    include_decommissioned: bool = False
    # Answered in another app instead of the built-in form (None = the form).
    answer_url: str | None = Field(None, max_length=500)

    @field_validator("answer_url")
    @classmethod
    def _check_answer_url(cls, v: str | None) -> str | None:
        return _answer_url(v)


class SurveyUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    target_node_type: str | None = None
    target_attribute_key: str | None = None
    questions: list[Question] | None = None
    reports: list[ReportDefinition] | None = None
    status: SurveyStatus | None = None
    allow_multiple_responses: bool | None = None
    # None can mean "clear the date" — the endpoint checks model_fields_set
    # to tell an explicit null apart from the field being omitted.
    due_date: date | None = None
    include_decommissioned: bool | None = None
    # Like due_date: an explicit null (or "") clears it, an omitted field leaves it.
    answer_url: str | None = Field(None, max_length=500)

    @field_validator("answer_url")
    @classmethod
    def _check_answer_url(cls, v: str | None) -> str | None:
        return _answer_url(v)


class SurveyRead(BaseModel):
    id: UUID
    title: str
    description: str
    status: SurveyStatus
    kind: SurveyKind
    target_node_type: str
    target_attribute_key: str
    questions: list[dict[str, Any]]
    reports: list[dict[str, Any]]
    allow_multiple_responses: bool
    due_date: date | None
    include_decommissioned: bool
    answer_url: str | None = None
    created_at: datetime
    created_by: str | None
    updated_at: datetime
    updated_by: str | None

    model_config = {"from_attributes": True}


class SurveyLaunchRequest(BaseModel):
    """Optional subset of response ids to launch to. Omitted/null = the whole resolved group."""
    response_ids: list[UUID] | None = None


class SurveySummary(BaseModel):
    id: UUID
    title: str
    status: SurveyStatus
    kind: SurveyKind
    due_date: date | None
    created_by: str | None
    updated_at: datetime
    updated_by: str | None

    model_config = {"from_attributes": True}
