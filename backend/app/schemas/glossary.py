"""Schemas for glossary terms (Ordlista)."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class GlossaryTermCreate(BaseModel):
    term: str = Field(..., min_length=1, max_length=255)
    definition: str = Field("", max_length=8000)


class GlossaryTermUpdate(BaseModel):
    term: str | None = Field(default=None, min_length=1, max_length=255)
    definition: str | None = Field(default=None, max_length=8000)


class GlossaryTermRead(BaseModel):
    id: UUID
    term: str
    definition: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GlossaryRequestCreate(BaseModel):
    term: str = Field(..., min_length=1, max_length=255)
    context: str | None = Field(default=None, max_length=2000)


class GlossaryRequestRead(BaseModel):
    id: UUID
    term: str
    context: str | None
    requested_by: str | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class FulfillGlossaryRequestBody(BaseModel):
    term: str = Field(..., min_length=1, max_length=255)
    definition: str = Field(..., min_length=1, max_length=8000)
