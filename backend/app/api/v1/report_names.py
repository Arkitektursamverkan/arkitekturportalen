"""Renaming a report.

Anyone signed in reads the names (the sidebar labels every report on every
page load); only admins set them.

Two kinds of report meet here. A built-in report's name lives in the locale
files, so renaming it stores an override that shadows the translation. A
published survey edition owns its `name` column — its exports and PDF
filenames read it — so renaming one writes to the edition itself.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.auth import CurrentUser
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_admin, require_user
from app.schemas.report_name import ReportNameRead, ReportRenameRequest

router = APIRouter(prefix="/report-names", tags=["report-names"])

PUBLISHED_PREFIX = "published:"


def _get_pg_repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Rapportnamn kräver PostgreSQL-backend",
        )
    return repo


def _published_id(report_key: str) -> UUID | None:
    """The edition id in a "published:<uuid>" key, or None for a built-in report."""
    if not report_key.startswith(PUBLISHED_PREFIX):
        return None
    try:
        return UUID(report_key[len(PUBLISHED_PREFIX):])
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Ogiltig rapportnyckel"
        )


def _check_key(report_key: str) -> str:
    key = report_key.strip()
    if not key or len(key) > 120:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ogiltig rapportnyckel")
    return key


@router.get("", response_model=list[ReportNameRead])
async def list_report_names(
    _user: CurrentUser = Depends(require_user),
) -> list[ReportNameRead]:
    """Only the renamed ones. Everything else goes by its translated name."""
    repo = _get_pg_repo()
    return [ReportNameRead.model_validate(r) for r in await repo.list_report_names()]


@router.put("/{report_key}", response_model=ReportNameRead)
async def rename_report(
    report_key: str,
    data: ReportRenameRequest,
    admin: CurrentUser = Depends(require_admin),
) -> ReportNameRead:
    repo = _get_pg_repo()
    key = _check_key(report_key)
    published_id = _published_id(key)

    if published_id is not None:
        row = await repo.rename_published_report(published_id, data.name)
        if row is None:
            raise HTTPException(status_code=404, detail="Den publicerade rapporten hittades inte")
        return ReportNameRead(report_key=key, name=row.name)

    saved = await repo.set_report_name(key, data.name, admin.email or admin.name or None)
    return ReportNameRead.model_validate(saved)


@router.delete("/{report_key}", status_code=status.HTTP_204_NO_CONTENT)
async def reset_report_name(
    report_key: str,
    _admin: CurrentUser = Depends(require_admin),
) -> Response:
    """Restore the built-in name."""
    repo = _get_pg_repo()
    key = _check_key(report_key)
    if _published_id(key) is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="En publicerad rapport har inget standardnamn att återställa",
        )
    if not await repo.clear_report_name(key):
        raise HTTPException(status_code=404, detail="Rapporten är inte omdöpt")
    return Response(status_code=204)
