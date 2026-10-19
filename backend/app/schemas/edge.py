"""Edge request/response schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel

from app.schemas.common import EdgeType, IntegrationDirection


class EdgeCreate(BaseModel):
    source_id: UUID
    target_id: UUID
    type: EdgeType
    #: Only meaningful for INTEGRATES_WITH; stored in `attributes["direction"]`.
    direction: IntegrationDirection | None = None
    attributes: dict[str, Any] = {}


class EdgeUpdate(BaseModel):
    note: str | None = None


class EdgeDirectionUpdate(BaseModel):
    direction: IntegrationDirection


class EdgeRead(BaseModel):
    id: UUID
    source_id: UUID
    target_id: UUID
    type: EdgeType
    attributes: dict[str, Any]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
