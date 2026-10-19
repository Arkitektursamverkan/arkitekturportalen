"""Glossary (Ordlista) endpoints: CRUD + PDF export with versioning."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.auth import CurrentUser
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_editor, require_user
from app.schemas.document_version import DocumentVersionList, DocumentVersionRead
from app.schemas.glossary import (
    FulfillGlossaryRequestBody,
    GlossaryRequestCreate,
    GlossaryRequestRead,
    GlossaryTermCreate,
    GlossaryTermRead,
    GlossaryTermUpdate,
)
from app.services.document_version import (
    DOCUMENT_GLOSSARY,
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

router = APIRouter(prefix="/glossary", tags=["glossary"])


def _get_pg_repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Glossary requires PostgreSQL backend",
        )
    return repo


def _to_read(row) -> GlossaryTermRead:  # type: ignore[no-untyped-def]
    return GlossaryTermRead.model_validate(row)


def _identity(u: CurrentUser) -> str | None:
    return u.email or u.name or None


# ── CRUD ──────────────────────────────────────────────────────────────────────


@router.get("", response_model=list[GlossaryTermRead])
async def list_glossary_terms(
    _user: CurrentUser = Depends(require_user),
) -> list[GlossaryTermRead]:
    repo = _get_pg_repo()
    rows = await repo.list_glossary_terms()
    return [_to_read(r) for r in rows]


@router.post("", response_model=GlossaryTermRead, status_code=status.HTTP_201_CREATED)
async def create_glossary_term(
    data: GlossaryTermCreate,
    admin: CurrentUser = Depends(require_editor),
) -> GlossaryTermRead:
    repo = _get_pg_repo()
    existing = await repo.get_glossary_term_by_name(data.term)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"En term med namnet \"{data.term}\" finns redan",
        )
    row = await repo.create_glossary_term(
        term=data.term.strip(),
        definition=data.definition,
        updated_by=_identity(admin),
    )
    return _to_read(row)


@router.patch("/{term_id}", response_model=GlossaryTermRead)
async def update_glossary_term(
    term_id: UUID,
    data: GlossaryTermUpdate,
    admin: CurrentUser = Depends(require_editor),
) -> GlossaryTermRead:
    repo = _get_pg_repo()
    if data.term is not None:
        clash = await repo.get_glossary_term_by_name(data.term)
        if clash is not None and clash.id != term_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"En term med namnet \"{data.term}\" finns redan",
            )
    row = await repo.update_glossary_term(
        term_id,
        term=data.term.strip() if data.term is not None else None,
        definition=data.definition,
        updated_by=_identity(admin),
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Term not found")
    return _to_read(row)


@router.delete("/{term_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_glossary_term(
    term_id: UUID,
    admin: CurrentUser = Depends(require_editor),
) -> Response:
    repo = _get_pg_repo()
    ok = await repo.delete_glossary_term(term_id, updated_by=_identity(admin))
    if not ok:
        raise HTTPException(status_code=404, detail="Term not found")
    return Response(status_code=204)


# ── Term requests ─────────────────────────────────────────────────────────────


@router.post(
    "/requests",
    response_model=GlossaryRequestRead,
    status_code=status.HTTP_201_CREATED,
)
async def submit_glossary_request(
    data: GlossaryRequestCreate,
    user: CurrentUser = Depends(require_user),
) -> GlossaryRequestRead:
    """Any authenticated user can request that a term be added to the glossary."""
    repo = _get_pg_repo()
    row = await repo.create_glossary_request(
        term=data.term,
        context=data.context,
        requested_by=user.name or user.email or None,
    )
    return GlossaryRequestRead.model_validate(row)


@router.post("/requests/{request_id}/fulfill", response_model=GlossaryTermRead)
async def fulfill_glossary_request(
    request_id: UUID,
    body: FulfillGlossaryRequestBody,
    editor: CurrentUser = Depends(require_editor),
) -> GlossaryTermRead:
    """Create a glossary term from a pending request and mark it as fulfilled."""
    repo = _get_pg_repo()
    req = await repo.get_glossary_request(request_id)
    if req is None or req.status != "pending":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Förfrågan hittades inte")
    existing = await repo.get_glossary_term_by_name(body.term)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f'Termen "{body.term}" finns redan i ordlistan',
        )
    term_row = await repo.create_glossary_term(
        term=body.term.strip(),
        definition=body.definition,
        updated_by=_identity(editor),
    )
    await repo.set_glossary_request_status(request_id, "fulfilled")
    return _to_read(term_row)


@router.post(
    "/requests/{request_id}/dismiss",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def dismiss_glossary_request(
    request_id: UUID,
    _editor: CurrentUser = Depends(require_editor),
) -> Response:
    """Dismiss a pending glossary term request without adding to glossary."""
    repo = _get_pg_repo()
    req = await repo.get_glossary_request(request_id)
    if req is None or req.status != "pending":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Förfrågan hittades inte")
    await repo.set_glossary_request_status(request_id, "dismissed")
    return Response(status_code=204)


# ── Versions & PDF export ─────────────────────────────────────────────────────


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
async def list_glossary_versions(
    _user: CurrentUser = Depends(require_user),
) -> DocumentVersionList:
    repo = _get_pg_repo()
    rows = await repo.list_document_versions(DOCUMENT_GLOSSARY, limit=200)
    latest = rows[0] if rows else None
    pending = await pending_change_count(repo, DOCUMENT_GLOSSARY)
    return DocumentVersionList(
        items=[_version_to_read(r) for r in rows],
        latest=_version_to_read(latest) if latest else None,
        pending_changes=pending,
    )


@router.get("/export")
async def export_glossary(
    bump: str | None = Query(
        default=None,
        description="'major' publishes a new huvudversion (admin); 'minor' publishes a delversion (admin). Omit for normal download.",
    ),
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
        pending = await pending_change_count(repo, DOCUMENT_GLOSSARY)
        if pending > 0:
            suffix = "ändring" if pending == 1 else "ändringar"
            note = f"Automatiskt skapad efter {pending} {suffix} sedan föregående version"

    version, _created = await ensure_current_version(
        repo,
        DOCUMENT_GLOSSARY,
        bump_major=bump_major,
        force_minor=publish_minor,
        created_by=_identity(user),
        change_summary=note,
    )

    meta_row = await repo.get_document_metadata(DOCUMENT_GLOSSARY)
    live_metadata = list(meta_row.entries) if meta_row else []

    all_versions = await repo.list_document_versions(DOCUMENT_GLOSSARY, limit=500)
    prior = prior_versions_in_same_major(all_versions, version)

    approved_at_str: str | None = None
    approved_by_str: str | None = None
    if approved:
        stamp_type = STAMP_DOCUMENT_TYPES.get(DOCUMENT_GLOSSARY)
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
        source_url=source_url_for_document(DOCUMENT_GLOSSARY),
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
async def export_glossary_version(
    version_id: UUID,
    _user: CurrentUser = Depends(require_user),
) -> Response:
    repo = _get_pg_repo()
    version = await repo.get_document_version(version_id)
    if version is None or version.document_type != DOCUMENT_GLOSSARY:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")

    meta_row = await repo.get_document_metadata(DOCUMENT_GLOSSARY)
    live_metadata = list(meta_row.entries) if meta_row else []

    all_versions = await repo.list_document_versions(DOCUMENT_GLOSSARY, limit=500)
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
