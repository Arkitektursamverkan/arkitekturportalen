"""End-user-facing endpoints for answering surveys ("Mina enkäter")."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import CurrentUser
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_user
from app.schemas.survey_response import (
    AnswerSubmit,
    RandomSurveyCheck,
    SurveyResponseRead,
    SurveyResponseSummary,
)

router = APIRouter(prefix="/my-surveys", tags=["my-surveys"])


def _get_pg_repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Enkäter kräver PostgreSQL-backend",
        )
    return repo


def _assert_owner(response: dict, user: CurrentUser) -> None:
    if user.role in ("admin", "system"):
        return
    assigned = response.get("assigned_user_id")
    if assigned is None or str(assigned) != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Den här enkäten är inte kopplad till ditt konto",
        )


def _user_id(user: CurrentUser) -> UUID | None:
    """The user's id, or None for the API-key system principal, which has no
    user row and so is never assigned a survey."""
    try:
        return UUID(user.id)
    except ValueError:
        return None


@router.get("", response_model=list[SurveyResponseSummary])
async def list_my_surveys(user: CurrentUser = Depends(require_user)) -> list[SurveyResponseSummary]:
    user_id = _user_id(user)
    if user_id is None:
        return []
    repo = _get_pg_repo()
    rows = await repo.list_survey_responses(assigned_user_id=user_id, for_my_surveys=True)
    return [SurveyResponseSummary.model_validate(r) for r in rows]


@router.post("/random-check", response_model=RandomSurveyCheck)
async def random_survey_check(user: CurrentUser = Depends(require_user)) -> RandomSurveyCheck:
    """Login-session dice roll for the random-system survey ("slumpenkät").

    Called by the frontend once per login session. Averages out to offering
    the survey every 3rd login; returns null when the roll fails, the user
    has other pending surveys, or there is nothing left to ask about.
    """
    user_id = _user_id(user)
    if user_id is None:
        return RandomSurveyCheck(response=None)
    repo = _get_pg_repo()
    row = await repo.check_random_survey_trigger(user_id)
    return RandomSurveyCheck(
        response=SurveyResponseSummary.model_validate(row) if row else None
    )


@router.get("/by-token/{token}", response_model=SurveyResponseRead)
async def get_by_token(token: str, user: CurrentUser = Depends(require_user)) -> SurveyResponseRead:
    repo = _get_pg_repo()
    row = await repo.get_survey_response_by_token(token)
    if row is None:
        raise HTTPException(status_code=404, detail="Länken är ogiltig")
    _assert_owner(row, user)
    return SurveyResponseRead.model_validate(row)


@router.get("/{response_id}", response_model=SurveyResponseRead)
async def get_my_survey(response_id: UUID, user: CurrentUser = Depends(require_user)) -> SurveyResponseRead:
    repo = _get_pg_repo()
    row = await repo.get_survey_response(response_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Enkätsvaret hittades inte")
    _assert_owner(row, user)
    return SurveyResponseRead.model_validate(row)


@router.post("/{response_id}/answers", response_model=SurveyResponseRead)
async def submit_answers(
    response_id: UUID,
    data: AnswerSubmit,
    user: CurrentUser = Depends(require_user),
) -> SurveyResponseRead:
    repo = _get_pg_repo()
    existing = await repo.get_survey_response(response_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Enkätsvaret hittades inte")
    _assert_owner(existing, user)
    if existing["survey_status"] == "closed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Enkäten är stängd och tar inte längre emot svar",
        )
    # Reviewed responses are normally locked — unless the survey creator
    # opted in to letting recipients keep re-submitting while it's open.
    reopened_for_resubmission = existing["status"] == "reviewed" and existing["allow_multiple_responses"]
    if existing["status"] not in ("pending", "submitted") and not reopened_for_resubmission:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Det här enkätsvaret kan inte längre ändras",
        )
    try:
        await repo.submit_survey_response(
            response_id, answers=data.answers, submitted_by=user.email or user.name or None
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    row = await repo.get_survey_response(response_id)
    return SurveyResponseRead.model_validate(row)
