"""Schemas for the Dokument and Anteckningar tabs on architecture objects."""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.authz import NodePermissions

DocumentKind = Literal["file", "link"]
DocumentType = Literal["rutin", "instruktion", "avtal", "beslut", "utredning", "ovrigt"]
Classification = Literal["intern", "begransad"]
NoteVisibility = Literal["shared", "private"]


def _check_url(v: str | None) -> str | None:
    """Only web links — a javascript: or file: URL must never reach an <a href>."""
    if v is None:
        return v
    v = v.strip()
    if not v.lower().startswith(("https://", "http://")):
        raise ValueError("Länken måste börja med https:// eller http://")
    return v


# ── Documents ───────────────────────────────────────────────────────────────

class DocumentVersionRead(BaseModel):
    id: UUID
    version_no: int
    filename: str
    content_type: str
    size_bytes: int
    comment: str
    uploaded_at: datetime
    uploaded_by: str | None

    model_config = {"from_attributes": True}


class DocumentRead(BaseModel):
    id: UUID
    node_id: UUID
    kind: DocumentKind
    title: str
    doc_type: DocumentType
    description: str
    classification: Classification
    url: str | None
    review_date: date | None
    created_at: datetime
    created_by: str | None
    updated_at: datetime
    updated_by: str | None
    # The newest file of an uploaded document; None for a link.
    current_version: DocumentVersionRead | None = None
    version_count: int = 0
    can_edit: bool = False


class DocumentList(BaseModel):
    permissions: NodePermissions
    documents: list[DocumentRead]


class LinkCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    url: str = Field(..., min_length=1, max_length=2000)
    doc_type: DocumentType = "ovrigt"
    description: str = ""
    classification: Classification = "intern"
    review_date: date | None = None

    _url = field_validator("url")(_check_url)


class DocumentUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    url: str | None = Field(None, min_length=1, max_length=2000)
    doc_type: DocumentType | None = None
    description: str | None = None
    classification: Classification | None = None
    review_date: date | None = None
    # review_date can be cleared, so None alone can't mean "unchanged".
    clear_review_date: bool = False

    _url = field_validator("url")(_check_url)


# ── Notes ───────────────────────────────────────────────────────────────────

class NoteRead(BaseModel):
    id: UUID
    node_id: UUID
    body: str
    visibility: NoteVisibility
    pinned: bool
    author_name: str | None
    created_at: datetime
    edited_at: datetime | None
    is_mine: bool = False
    can_edit: bool = False


class NoteList(BaseModel):
    permissions: NodePermissions
    notes: list[NoteRead]


class NoteCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=50_000)
    visibility: NoteVisibility = "shared"
    pinned: bool = False


class NoteUpdate(BaseModel):
    body: str | None = Field(None, min_length=1, max_length=50_000)
    visibility: NoteVisibility | None = None
    pinned: bool | None = None


class ContentSummary(BaseModel):
    """How much hangs off an object — for the delete confirmation. Counts
    everything, private notes and restricted documents included, since all
    of it goes with the object."""

    documents: int
    notes: int
