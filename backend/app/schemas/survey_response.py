"""Schemas for survey response slots — one per (survey, system)."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel

from app.schemas.survey import Question, SurveyKind, SurveyStatus

MatchStatus = Literal["matched", "ambiguous", "unmatched", "manual", "random"]
ResponseStatus = Literal["draft", "pending", "submitted", "reviewed"]


class RecipientAssign(BaseModel):
    user_id: UUID


class ManualRecipientAdd(BaseModel):
    user_id: UUID
    # Optional object to map this recipient to (e.g. a specific process) —
    # omitted/null means a general send-out with no object attached.
    node_id: UUID | None = None


class AnswerSubmit(BaseModel):
    answers: dict[str, Any]


class SurveyResponseSummary(BaseModel):
    id: UUID
    survey_id: UUID
    survey_title: str
    survey_status: SurveyStatus
    survey_kind: SurveyKind
    survey_due_date: date | None
    allow_multiple_responses: bool
    node_id: UUID | None
    node_name: str | None
    raw_target_value: str | None
    assigned_user_id: UUID | None
    assigned_user_name: str | None
    assigned_user_email: str | None
    match_status: MatchStatus
    status: ResponseStatus
    answers: dict[str, Any]
    token: str
    submitted_at: datetime | None
    submitted_by: str | None
    reviewed_at: datetime | None
    reviewed_by: str | None
    updated_at: datetime

    model_config = {"from_attributes": True}


class RandomSurveyCheck(BaseModel):
    """Result of a login-triggered random-survey roll — null means nothing to offer."""
    response: SurveyResponseSummary | None = None


class SurveyResponseRead(BaseModel):
    id: UUID
    survey_id: UUID
    survey_title: str
    survey_description: str
    survey_status: SurveyStatus
    survey_kind: SurveyKind
    survey_due_date: date | None
    allow_multiple_responses: bool
    questions: list[Question]
    node_id: UUID | None
    node_name: str | None
    assigned_user_id: UUID | None
    match_status: MatchStatus
    status: ResponseStatus
    answers: dict[str, Any]
    token: str
    submitted_at: datetime | None
    submitted_by: str | None
    reviewed_at: datetime | None
    reviewed_by: str | None

    model_config = {"from_attributes": True}
