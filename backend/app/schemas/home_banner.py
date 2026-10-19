"""Schemas for operational banner announcements."""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


Severity = Literal["info", "warning", "error"]


class HomeBannerRead(BaseModel):
    id: UUID
    body: str
    severity: Severity
    enabled: bool
    created_at: datetime
    updated_at: datetime
    updated_by: str | None = None


class HomeBannerCreate(BaseModel):
    body: str
    severity: Severity = "info"
    enabled: bool = True


class HomeBannerUpdate(BaseModel):
    body: str
    severity: Severity
    enabled: bool


class HomeBannersList(BaseModel):
    banners: list[HomeBannerRead] = Field(default_factory=list)
