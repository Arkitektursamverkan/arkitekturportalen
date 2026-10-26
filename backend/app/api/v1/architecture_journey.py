"""Arkitekturresan: the editable steps, and the Fastslaget / Reviderat stamps
of the documents a step can point to."""
from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import CurrentUser
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_editor, require_user
from app.schemas.architecture_journey import JourneyContent, JourneyRead
from app.schemas.document_stamp import (
    ApproveDocumentRequest,
    JourneyDocumentStatus,
    JourneyStatusResponse,
    PatchStampDatesRequest,
)
from app.services import architecture_journey

router = APIRouter(prefix="/architecture-journey", tags=["architecture-journey"])

_VALID_DOC_TYPES = {"nulaagesanalys", "target_architecture", "gap_analys", "principles"}


def _get_pg_repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Architecture Journey stamps require PostgreSQL backend",
        )
    return repo


def _who(user: CurrentUser) -> str | None:
    return user.email or user.name or None


@router.get("", response_model=JourneyRead)
async def get_journey(_user: CurrentUser = Depends(require_user)) -> JourneyRead:
    """The journey's title, intro and steps; the built-in ones until saved."""
    return await architecture_journey.read(_get_pg_repo()._session_factory)


@router.put("", response_model=JourneyRead)
async def save_journey(content: JourneyContent, editor: CurrentUser = Depends(require_editor)) -> JourneyRead:
    return await architecture_journey.save(_get_pg_repo()._session_factory, content, _who(editor))


@router.delete("", response_model=JourneyRead)
async def reset_journey(editor: CurrentUser = Depends(require_editor)) -> JourneyRead:
    """Back to the built-in steps."""
    return await architecture_journey.save(_get_pg_repo()._session_factory, None, _who(editor))


@router.get("/stamps", response_model=JourneyStatusResponse)
async def get_journey_stamps(
    _user: CurrentUser = Depends(require_user),
) -> JourneyStatusResponse:
    """Return Fastslaget / Reviderat stamp data for all four journey documents."""
    repo = _get_pg_repo()
    return await repo.get_journey_stamps()


@router.put(
    "/stamps/{doc_type}/approve",
    response_model=JourneyDocumentStatus,
)
async def approve_document(
    doc_type: str,
    body: ApproveDocumentRequest,
    editor: CurrentUser = Depends(require_editor),
) -> JourneyDocumentStatus:
    """Set the 'Fastslaget' approval stamp on a document."""
    if doc_type not in _VALID_DOC_TYPES:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown document type '{doc_type}'. Valid: {sorted(_VALID_DOC_TYPES)}",
        )
    repo = _get_pg_repo()
    approved_by = body.approved_by.strip() or editor.name or editor.email or ""
    approved_at = body.approved_at if body.approved_at is not None else datetime.now(UTC)
    await repo.set_document_approval(
        document_type=doc_type,
        approved_at=approved_at,
        approved_by=approved_by,
    )
    # Return the full fresh status for this document type
    result = await repo.get_journey_stamps()
    return result.documents[doc_type]


@router.patch(
    "/stamps/{doc_type}/dates",
    response_model=JourneyDocumentStatus,
)
async def update_stamp_dates(
    doc_type: str,
    body: PatchStampDatesRequest,
    editor: CurrentUser = Depends(require_editor),
) -> JourneyDocumentStatus:
    """Update the date of an existing Fastslaget or Reviderat stamp."""
    if doc_type not in _VALID_DOC_TYPES:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown document type '{doc_type}'. Valid: {sorted(_VALID_DOC_TYPES)}",
        )
    repo = _get_pg_repo()
    fields = body.model_fields_set
    if "approved_at" in fields and body.approved_at is not None:
        await repo.update_approved_at(document_type=doc_type, approved_at=body.approved_at)
    if "revised_at" in fields and body.revised_at is not None:
        await repo.set_revised_at_override(document_type=doc_type, revised_at_override=body.revised_at)
    result = await repo.get_journey_stamps()
    return result.documents[doc_type]


@router.delete(
    "/stamps/{doc_type}/approve",
    response_model=JourneyDocumentStatus,
)
async def clear_document_approval(
    doc_type: str,
    editor: CurrentUser = Depends(require_editor),
) -> JourneyDocumentStatus:
    """Remove the 'Fastslaget' approval stamp from a document."""
    if doc_type not in _VALID_DOC_TYPES:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown document type '{doc_type}'. Valid: {sorted(_VALID_DOC_TYPES)}",
        )
    repo = _get_pg_repo()
    await repo.clear_document_approval(document_type=doc_type)
    # Return the full fresh status for this document type
    result = await repo.get_journey_stamps()
    return result.documents[doc_type]
