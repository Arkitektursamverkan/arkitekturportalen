"""Schemas for the editable PDF footer metadata."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class MetadataEntry(BaseModel):
    label: str = Field(..., min_length=1, max_length=80)
    value: str = Field(default="", max_length=200)


class DocumentMetadataRead(BaseModel):
    document_type: str
    entries: list[MetadataEntry] = Field(default_factory=list)
    updated_at: datetime
    updated_by: str | None = None


class DocumentMetadataUpdate(BaseModel):
    entries: list[MetadataEntry]
