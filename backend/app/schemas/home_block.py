"""Schemas for editable Home-page content blocks."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class HomeBlockRead(BaseModel):
    key: str
    body: str
    enabled: bool = True
    updated_at: datetime
    updated_by: str | None = None


class HomeBlockUpdate(BaseModel):
    body: str
    enabled: bool = True


class HomeBlocksList(BaseModel):
    blocks: list[HomeBlockRead]
