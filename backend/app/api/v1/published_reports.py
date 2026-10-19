"""Published survey reports — the editions listed under "Rapporter".

Read-only by design: an edition is a frozen copy made by
POST /surveys/{id}/reports/{number}/publish. Nothing here recompiles it, so a
published report keeps saying what it said on the day it was published.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.auth import CurrentUser
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_editor
from app.models.published_report import PublishedReportORM
from app.schemas.published_report import PublishedReportRead, PublishedReportSummary
from app.services.survey_export import build_report_csv, export_filename

router = APIRouter(prefix="/published-reports", tags=["published-reports"])


def _get_pg_repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Publicerade rapporter kräver PostgreSQL-backend",
        )
    return repo


def to_summary(row: PublishedReportORM) -> dict:
    """Listing fields, with the counts lifted out of the frozen payload."""
    payload = row.payload or {}
    return {
        "id": row.id,
        "survey_id": row.survey_id,
        "survey_title": row.survey_title,
        "report_number": row.report_number,
        "name": row.name,
        "published_at": row.published_at,
        "published_by": row.published_by,
        "row_count": len(payload.get("rows") or []),
        "matching_count": payload.get("matching_count") or 0,
        "answered_count": payload.get("answered_count") or 0,
    }


async def _get_or_404(repo: PostgresRepository, report_id: UUID) -> PublishedReportORM:
    row = await repo.get_published_report(report_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Den publicerade rapporten hittades inte")
    return row


@router.get("", response_model=list[PublishedReportSummary])
async def list_published_reports(
    _user: CurrentUser = Depends(require_editor),
) -> list[PublishedReportSummary]:
    """Every published edition, newest first."""
    repo = _get_pg_repo()
    return [PublishedReportSummary(**to_summary(r)) for r in await repo.list_published_reports()]


@router.get("/{report_id}", response_model=PublishedReportRead)
async def get_published_report(
    report_id: UUID,
    _user: CurrentUser = Depends(require_editor),
) -> PublishedReportRead:
    repo = _get_pg_repo()
    row = await _get_or_404(repo, report_id)
    return PublishedReportRead(**to_summary(row), payload=row.payload or {})


@router.get("/{report_id}/export")
async def export_published_report(
    report_id: UUID,
    format: str = Query("csv", pattern="^(csv|pdf)$"),
    _user: CurrentUser = Depends(require_editor),
) -> Response:
    """Download a published edition, exactly as it was frozen."""
    repo = _get_pg_repo()
    row = await _get_or_404(repo, report_id)
    payload = row.payload or {}
    stem = f"{row.survey_title} {row.name}"

    if format == "pdf":
        from app.services.pdf.renderer import render_survey_report_pdf

        return Response(
            content=render_survey_report_pdf(payload),
            media_type="application/pdf",
            headers={
                "Content-Disposition":
                    f'attachment; filename="'
                    f'{export_filename(stem, row.published_at, prefix="rapport", extension="pdf")}"',
            },
        )

    return Response(
        content=("\ufeff" + build_report_csv(payload)).encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition":
                f'attachment; filename="{export_filename(stem, row.published_at, prefix="rapport")}"',
        },
    )


@router.delete("/{report_id}")
async def delete_published_report(
    report_id: UUID,
    _user: CurrentUser = Depends(require_editor),
) -> Response:
    """Unpublish one edition. The survey and its answers are untouched."""
    repo = _get_pg_repo()
    if not await repo.delete_published_report(report_id):
        raise HTTPException(status_code=404, detail="Den publicerade rapporten hittades inte")
    return Response(status_code=204)
