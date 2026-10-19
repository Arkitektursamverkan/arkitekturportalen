"""Principle document endpoints — singleton free-text content for the principle report."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.access import get_optional_user
from app.auth import CurrentUser
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_editor, require_user
from app.schemas.document_version import DocumentVersionList, DocumentVersionRead
from app.schemas.principle_document import (
    PrincipleDocumentRead,
    PrincipleDocumentSections,
    PrincipleDocumentUpdate,
)
from app.services.document_version import (
    DOCUMENT_PRINCIPLE_DOCUMENT,
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

router = APIRouter(prefix="/principle-document", tags=["principle-document"])


def _get_pg_repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Principle document is only available with PostgreSQL backend",
        )
    return repo


def _to_read(orm) -> PrincipleDocumentRead:  # type: ignore[no-untyped-def]
    sec = orm.sections or {}
    return PrincipleDocumentRead(
        id=orm.id,
        sections=PrincipleDocumentSections(
            introduction=sec.get("introduction", ""),
            decision_forum=sec.get("decision_forum", ""),
            deviation_handling=sec.get("deviation_handling", ""),
            target_arch_alignment=sec.get("target_arch_alignment", ""),
        ),
        updated_at=orm.updated_at,
    )


@router.get("", response_model=PrincipleDocumentRead, dependencies=[Depends(get_optional_user)])
async def get_principle_document() -> PrincipleDocumentRead:
    repo = _get_pg_repo()
    row = await repo.get_principle_document()
    if row is None:
        raise HTTPException(status_code=404, detail="Principle document not initialised")
    return _to_read(row)


@router.patch("", response_model=PrincipleDocumentRead)
async def update_principle_document(
    data: PrincipleDocumentUpdate,
    admin: CurrentUser = Depends(require_editor),
) -> PrincipleDocumentRead:
    repo = _get_pg_repo()
    payload = data.model_dump(exclude_none=True)
    change_note = payload.pop("change_note", None)
    row = await repo.update_principle_document(
        payload,
        updated_by=admin.email or admin.name or None,
        change_note=change_note,
    )
    return _to_read(row)


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
async def list_principle_document_versions(
    _user: CurrentUser = Depends(require_user),
) -> DocumentVersionList:
    repo = _get_pg_repo()
    rows = await repo.list_document_versions(DOCUMENT_PRINCIPLE_DOCUMENT, limit=200)
    latest = rows[0] if rows else None
    pending = await pending_change_count(repo, DOCUMENT_PRINCIPLE_DOCUMENT)
    return DocumentVersionList(
        items=[_version_to_read(r) for r in rows],
        latest=_version_to_read(latest) if latest else None,
        pending_changes=pending,
    )


@router.get("/export")
async def export_principle_document(
    bump: str | None = Query(
        default=None,
        description="'major' publishes a new huvudversion (admin); 'minor' publishes a delversion (admin). Omit for normal download (auto-creates a delversion only if principles have changed).",
    ),
    change_note: str | None = Query(default=None, description="Optional comment stored with the new version"),
    status_filter: list[str] | None = Query(
        default=None,
        alias="status",
        description="Repeat to restrict included principle statuses. Publish (major/minor) ignores this filter.",
    ),
    approved: bool = Query(default=False, description="Include approval stamp (Fastställt / Fastställt av) in the PDF."),
    user: CurrentUser = Depends(require_user),
) -> Response:
    repo = _get_pg_repo()
    bump_major = bump == "major"
    publish_minor = bump == "minor"
    if (bump_major or publish_minor) and user.role not in ("admin", "system"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required to publish a version")

    note = (change_note or "").strip() or None
    # Auto-summary for silent download flow when audit-driven delversion is created.
    if not bump_major and not publish_minor and note is None:
        pending = await pending_change_count(repo, DOCUMENT_PRINCIPLE_DOCUMENT)
        if pending > 0:
            suffix = "ändring" if pending == 1 else "ändringar"
            note = f"Automatiskt skapad efter {pending} {suffix} sedan föregående version"

    version, _created = await ensure_current_version(
        repo,
        DOCUMENT_PRINCIPLE_DOCUMENT,
        bump_major=bump_major,
        force_minor=publish_minor,
        created_by=user.email or user.name or None,
        change_summary=note,
    )

    meta_row = await repo.get_document_metadata(DOCUMENT_PRINCIPLE_DOCUMENT)
    live_metadata = list(meta_row.entries) if meta_row else []

    # Publish (major or minor) always includes the full snapshot; status
    # filter only applies to ad-hoc downloads.
    allowed_statuses = None if (bump_major or publish_minor) else status_filter

    all_versions = await repo.list_document_versions(DOCUMENT_PRINCIPLE_DOCUMENT, limit=500)
    prior = prior_versions_in_same_major(all_versions, version)

    approved_at_str: str | None = None
    approved_by_str: str | None = None
    if approved:
        stamp_type = STAMP_DOCUMENT_TYPES.get(DOCUMENT_PRINCIPLE_DOCUMENT)
        if stamp_type:
            stamp = await repo.get_document_stamp(stamp_type)
            if stamp and stamp.approved_at:
                approved_at_str = stamp.approved_at.strftime("%Y-%m-%d")
                approved_by_str = stamp.approved_by or None

    pdf_bytes = render_version_to_pdf(
        version,
        metadata_entries=live_metadata,
        allowed_principle_statuses=allowed_statuses,
        prior_versions=prior,
        approved_at=approved_at_str,
        approved_by=approved_by_str,
        source_url=source_url_for_document(DOCUMENT_PRINCIPLE_DOCUMENT),
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
async def export_principle_document_version(
    version_id: UUID,
    _user: CurrentUser = Depends(require_user),
) -> Response:
    repo = _get_pg_repo()
    version = await repo.get_document_version(version_id)
    if version is None or version.document_type != DOCUMENT_PRINCIPLE_DOCUMENT:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")

    meta_row = await repo.get_document_metadata(DOCUMENT_PRINCIPLE_DOCUMENT)
    live_metadata = list(meta_row.entries) if meta_row else []

    all_versions = await repo.list_document_versions(DOCUMENT_PRINCIPLE_DOCUMENT, limit=500)
    prior = prior_versions_in_same_major(all_versions, version)

    pdf_bytes = render_version_to_pdf(
        version,
        metadata_entries=live_metadata,
        prior_versions=prior,
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename_for_version(version)}"',
            "X-Document-Version": f"{version.version_major}.{version.version_minor}",
        },
    )
