"""Schemas for the Nulägesanalys IT-arkitektur document."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class TextSection(BaseModel):
    id: str
    title: str
    body: str = ""


class NulaagesanalysContent(BaseModel):
    sections: list[TextSection] = Field(default_factory=list)


class NulaagesanalysRead(BaseModel):
    content: NulaagesanalysContent
    updated_at: datetime
    updated_by: str | None = None
