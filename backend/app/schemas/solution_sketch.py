"""Schemas for Lösningsskiss."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


SketchStatus = Literal["draft", "in_review", "approved", "archived"]


class SketchCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str = ""


class SketchUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    status: SketchStatus | None = None
    answers: dict[str, Any] | None = None


class SketchRead(BaseModel):
    id: UUID
    title: str
    description: str
    status: SketchStatus
    answers: dict[str, Any]
    created_at: datetime
    created_by: str | None
    updated_at: datetime
    updated_by: str | None

    model_config = {"from_attributes": True}


class SketchSummary(BaseModel):
    """Lightweight row for list views."""
    id: UUID
    title: str
    status: SketchStatus
    created_by: str | None
    updated_at: datetime
    updated_by: str | None

    model_config = {"from_attributes": True}
