"""Schemas for the principle document (free-text sections of the principle report)."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class PrincipleDocumentSections(BaseModel):
    introduction: str = ""
    decision_forum: str = ""
    deviation_handling: str = ""
    target_arch_alignment: str = ""


class PrincipleDocumentRead(BaseModel):
    id: UUID
    sections: PrincipleDocumentSections
    updated_at: datetime


class PrincipleDocumentUpdate(BaseModel):
    introduction: str | None = None
    decision_forum: str | None = None
    deviation_handling: str | None = None
    target_arch_alignment: str | None = None
    change_note: str | None = None
