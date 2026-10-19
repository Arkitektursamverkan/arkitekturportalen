"""Endpoints for the editable GAP-analys IT-arkitektur (TOGAF) document."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.auth import CurrentUser
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_editor, require_user
from app.schemas.document_version import DocumentVersionList, DocumentVersionRead
from app.schemas.gap_analys import GapAnalysContent, GapAnalysRead
from app.services.document_version import (
    DOCUMENT_GAP_ANALYS,
    ensure_current_version,
    pending_change_count,
)
from app.services.pdf.renderer import (
    STAMP_DOCUMENT_TYPES,
    filename_for_version,
    prior_versions_in_same_major,
    render_version_to_pdf,
    source_url_for_document,
)

router = APIRouter(prefix="/gap-analys", tags=["gap-analys"])


def _get_pg_repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="GAP-analys requires PostgreSQL backend",
        )
    return repo


@router.get("", response_model=GapAnalysRead)
async def get_gap_analys(
    _user: CurrentUser = Depends(require_user),
) -> GapAnalysRead:
    repo = _get_pg_repo()
    row = await repo.get_gap_analys()
    if row is None:
        raise HTTPException(status_code=404, detail="GAP-analys not initialised")
    return GapAnalysRead(
        content=GapAnalysContent.model_validate(row.content),
        updated_at=row.updated_at,
        updated_by=row.updated_by,
    )


def _version_to_read(row) -> DocumentVersionRead:  # type: ignore[no-untyped-def]
    return DocumentVersionRead(
        id=row.id,
        document_type=row.document_type,
        version_major=row.version_major,
        version_minor=row.version_minor,
        is_major=row.is_major,
        change_summary=row.change_summary,
        created_at=row.created_at,
        created_by=row.created_by,
    )


@router.get("/versions", response_model=DocumentVersionList)
async def list_gap_analys_versions(
    _user: CurrentUser = Depends(require_user),
) -> DocumentVersionList:
    repo = _get_pg_repo()
    rows = await repo.list_document_versions(DOCUMENT_GAP_ANALYS, limit=200)
    latest = rows[0] if rows else None
    pending = await pending_change_count(repo, DOCUMENT_GAP_ANALYS)
    return DocumentVersionList(
        items=[_version_to_read(r) for r in rows],
        latest=_version_to_read(latest) if latest else None,
        pending_changes=pending,
    )


@router.get("/export")
async def export_gap_analys(
    bump: str | None = Query(default=None),
    change_note: str | None = Query(default=None),
    approved: bool = Query(default=False, description="Include approval stamp (Fastställt / Fastställt av) in the PDF."),
    user: CurrentUser = Depends(require_user),
) -> Response:
    repo = _get_pg_repo()
    bump_major = bump == "major"
    publish_minor = bump == "minor"
    if (bump_major or publish_minor) and user.role not in ("admin", "system"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required to publish a version")

    note = (change_note or "").strip() or None
    if not bump_major and not publish_minor and note is None:
        pending = await pending_change_count(repo, DOCUMENT_GAP_ANALYS)
        if pending > 0:
            suffix = "ändring" if pending == 1 else "ändringar"
            note = f"Automatiskt skapad efter {pending} {suffix} sedan föregående version"

    version, _created = await ensure_current_version(
        repo,
        DOCUMENT_GAP_ANALYS,
        bump_major=bump_major,
        force_minor=publish_minor,
        created_by=user.email or user.name or None,
        change_summary=note,
    )

    meta_row = await repo.get_document_metadata(DOCUMENT_GAP_ANALYS)
    live_metadata = list(meta_row.entries) if meta_row else []
    all_versions = await repo.list_document_versions(DOCUMENT_GAP_ANALYS, limit=500)
    prior = prior_versions_in_same_major(all_versions, version)

    approved_at_str: str | None = None
    approved_by_str: str | None = None
    if approved:
        stamp_type = STAMP_DOCUMENT_TYPES.get(DOCUMENT_GAP_ANALYS)
        if stamp_type:
            stamp = await repo.get_document_stamp(stamp_type)
            if stamp and stamp.approved_at:
                approved_at_str = stamp.approved_at.strftime("%Y-%m-%d")
                approved_by_str = stamp.approved_by or None

    pdf_bytes = render_version_to_pdf(
        version,
        metadata_entries=live_metadata,
        prior_versions=prior,
        approved_at=approved_at_str,
        approved_by=approved_by_str,
        source_url=source_url_for_document(DOCUMENT_GAP_ANALYS),
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename_for_version(version)}"',
            "X-Document-Version": f"{version.version_major}.{version.version_minor}",
        },
    )


@router.get("/versions/{version_id}/export")
async def export_gap_analys_version(
    version_id: UUID,
    _user: CurrentUser = Depends(require_user),
) -> Response:
    repo = _get_pg_repo()
    version = await repo.get_document_version(version_id)
    if version is None or version.document_type != DOCUMENT_GAP_ANALYS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")

    meta_row = await repo.get_document_metadata(DOCUMENT_GAP_ANALYS)
    live_metadata = list(meta_row.entries) if meta_row else []
    all_versions = await repo.list_document_versions(DOCUMENT_GAP_ANALYS, limit=500)
    prior = prior_versions_in_same_major(all_versions, version)

    pdf_bytes = render_version_to_pdf(version, metadata_entries=live_metadata, prior_versions=prior)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename_for_version(version)}"',
            "X-Document-Version": f"{version.version_major}.{version.version_minor}",
        },
    )


@router.put("", response_model=GapAnalysRead)
async def update_gap_analys(
    data: GapAnalysContent,
    change_note: str | None = Query(default=None),
    admin: CurrentUser = Depends(require_editor),
) -> GapAnalysRead:
    repo = _get_pg_repo()
    row = await repo.update_gap_analys(
        data.model_dump(),
        updated_by=admin.email or admin.name or None,
        change_note=change_note,
    )
    return GapAnalysRead(
        content=GapAnalysContent.model_validate(row.content),
        updated_at=row.updated_at,
        updated_by=row.updated_by,
    )
