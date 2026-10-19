"""Schemas for versioned document snapshots."""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class DocumentVersionRead(BaseModel):
    id: UUID
    document_type: str
    version_major: int
    version_minor: int
    is_major: bool
    change_summary: str | None = None
    created_at: datetime
    created_by: str | None = None

    @property
    def version_label(self) -> str:
        return f"{self.version_major}.{self.version_minor}"


class DocumentVersionDetail(DocumentVersionRead):
    snapshot: dict[str, Any] = Field(default_factory=dict)
    audit_entries: list[dict[str, Any]] = Field(default_factory=list)


class DocumentVersionList(BaseModel):
    items: list[DocumentVersionRead] = Field(default_factory=list)
    latest: DocumentVersionRead | None = None
    pending_changes: int = 0
