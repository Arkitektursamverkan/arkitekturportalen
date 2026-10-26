"""CRUD endpoints for operational banner announcements shown globally."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response

from app.auth import CurrentUser
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_editor, require_user
from app.schemas.home_banner import (
    HomeBannerCreate,
    HomeBannerRead,
    HomeBannersList,
    HomeBannerUpdate,
)

router = APIRouter(prefix="/home-banners", tags=["home-banners"])


def _get_pg_repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Home banners require PostgreSQL backend",
        )
    return repo


def _to_read(row) -> HomeBannerRead:
    return HomeBannerRead(
        id=row.id,
        body=row.body,
        severity=row.severity,
        enabled=row.enabled,
        created_at=row.created_at,
        updated_at=row.updated_at,
        updated_by=row.updated_by,
    )


@router.get("", response_model=HomeBannersList)
async def list_home_banners(
    _user: CurrentUser = Depends(require_user),
) -> HomeBannersList:
    repo = _get_pg_repo()
    rows = await repo.list_home_banners()
    return HomeBannersList(banners=[_to_read(r) for r in rows])


@router.post("", response_model=HomeBannerRead, status_code=status.HTTP_201_CREATED)
async def create_home_banner(
    data: HomeBannerCreate,
    admin: CurrentUser = Depends(require_editor),
) -> HomeBannerRead:
    repo = _get_pg_repo()
    row = await repo.create_home_banner(
        body=data.body,
        severity=data.severity,
        enabled=data.enabled,
        updated_by=admin.email or admin.name or None,
    )
    return _to_read(row)


@router.put("/{banner_id}", response_model=HomeBannerRead)
async def update_home_banner(
    banner_id: UUID,
    data: HomeBannerUpdate,
    admin: CurrentUser = Depends(require_editor),
) -> HomeBannerRead:
    repo = _get_pg_repo()
    row = await repo.update_home_banner(
        banner_id=banner_id,
        body=data.body,
        severity=data.severity,
        enabled=data.enabled,
        updated_by=admin.email or admin.name or None,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Banner not found")
    return _to_read(row)


@router.delete("/{banner_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_home_banner(
    banner_id: UUID,
    _admin: CurrentUser = Depends(require_editor),
) -> Response:
    repo = _get_pg_repo()
    deleted = await repo.delete_home_banner(banner_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Banner not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
