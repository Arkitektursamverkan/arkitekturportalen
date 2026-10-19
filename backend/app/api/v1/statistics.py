"""Anonymised usage statistics endpoints — admin only."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.auth import CurrentUser
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_admin, require_user
from app.schemas.statistics import UsageStatistics

router = APIRouter(prefix="/statistics", tags=["statistics"])


def _get_pg_repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Statistics require PostgreSQL backend",
        )
    return repo


@router.get("", response_model=UsageStatistics, dependencies=[Depends(require_admin)])
async def get_statistics(
    period_days: int = Query(30, ge=7, le=365, description="Number of days to include"),
) -> UsageStatistics:
    """Return anonymised aggregate usage data from the audit log."""
    repo = _get_pg_repo()
    return await repo.get_usage_statistics(period_days=period_days)


@router.post("/session", status_code=204)
async def record_session(user: CurrentUser = Depends(require_user)) -> Response:
    """Record an anonymous session event.

    Called once per browser session from the frontend on initial load.
    No personally identifiable data is stored — a random UUID is used as
    the entity_id so individual login events cannot be correlated.
    """
    repo = get_repository()
    if isinstance(repo, PostgresRepository):
        await repo.record_login_event(user_id=uuid.uuid4())
    return Response(status_code=204)
