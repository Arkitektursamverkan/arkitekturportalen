"""Endpoints for editable PDF footer metadata per document type."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Path, status

from app.auth import CurrentUser
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_editor, require_user
from app.schemas.document_metadata import (
    DocumentMetadataRead,
    DocumentMetadataUpdate,
    MetadataEntry,
)
from app.services.document_version import (
    DOCUMENT_GLOSSARY,
    DOCUMENT_PRINCIPLE_DOCUMENT,
    DOCUMENT_TARGET_ARCHITECTURE,
)

router = APIRouter(prefix="/document-metadata", tags=["document-metadata"])

_VALID_TYPES = {DOCUMENT_TARGET_ARCHITECTURE, DOCUMENT_PRINCIPLE_DOCUMENT, DOCUMENT_GLOSSARY}


def _get_pg_repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Document metadata requires PostgreSQL backend",
        )
    return repo


def _validate_type(document_type: str) -> None:
    if document_type not in _VALID_TYPES:
        raise HTTPException(status_code=404, detail=f"Unknown document type: {document_type}")


def _to_read(row) -> DocumentMetadataRead:  # type: ignore[no-untyped-def]
    return DocumentMetadataRead(
        document_type=row.document_type,
        entries=[MetadataEntry.model_validate(e) for e in (row.entries or [])],
        updated_at=row.updated_at,
        updated_by=row.updated_by,
    )


@router.get("/{document_type}", response_model=DocumentMetadataRead)
async def get_document_metadata(
    document_type: str = Path(...),
    _user: CurrentUser = Depends(require_user),
) -> DocumentMetadataRead:
    _validate_type(document_type)
    repo = _get_pg_repo()
    row = await repo.get_document_metadata(document_type)
    if row is None:
        raise HTTPException(status_code=404, detail="Metadata not initialised")
    return _to_read(row)


@router.put("/{document_type}", response_model=DocumentMetadataRead)
async def update_document_metadata(
    data: DocumentMetadataUpdate,
    document_type: str = Path(...),
    admin: CurrentUser = Depends(require_editor),
) -> DocumentMetadataRead:
    _validate_type(document_type)
    repo = _get_pg_repo()
    row = await repo.upsert_document_metadata(
        document_type,
        [e.model_dump() for e in data.entries],
        updated_by=admin.email or admin.name or None,
    )
    return _to_read(row)
