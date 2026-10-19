"""Endpoints for editable Home-page content blocks."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import CurrentUser
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_editor, require_user
from app.schemas.home_block import HomeBlockRead, HomeBlockUpdate, HomeBlocksList


router = APIRouter(prefix="/home-blocks", tags=["home-blocks"])


def _get_pg_repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Home blocks require PostgreSQL backend",
        )
    return repo


def _to_read(row) -> HomeBlockRead:
    return HomeBlockRead(
        key=row.key,
        body=row.body,
        enabled=row.enabled,
        updated_at=row.updated_at,
        updated_by=row.updated_by,
    )


@router.get("", response_model=HomeBlocksList)
async def list_home_blocks(
    _user: CurrentUser = Depends(require_user),
) -> HomeBlocksList:
    repo = _get_pg_repo()
    rows = await repo.list_home_blocks()
    return HomeBlocksList(blocks=[_to_read(r) for r in rows])


@router.put("/{key}", response_model=HomeBlockRead)
async def update_home_block(
    key: str,
    data: HomeBlockUpdate,
    admin: CurrentUser = Depends(require_editor),
) -> HomeBlockRead:
    repo = _get_pg_repo()
    row = await repo.upsert_home_block(
        key=key,
        body=data.body,
        enabled=data.enabled,
        updated_by=admin.email or admin.name or None,
    )
    return _to_read(row)
