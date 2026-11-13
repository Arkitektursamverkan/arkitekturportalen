"""Node request/response schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ExternalSource, NodeType


class NodeCreate(BaseModel):
    type: NodeType
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    external_source: ExternalSource = ExternalSource.NONE
    external_id: str | None = None
    attributes: dict[str, Any] = {}


class OwnFieldValues(BaseModel):
    """Values for the fields an admin added (app.domain_lists); None clears one."""

    values: dict[str, str | None] = Field(default_factory=dict, max_length=60)


class NodeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    attributes: dict[str, Any] | None = None
    archived: bool | None = None
    admin_hidden: bool | None = None
    is_structure: bool | None = None


class NodeRead(BaseModel):
    id: UUID
    type: NodeType
    name: str
    description: str | None = None
    external_source: ExternalSource
    external_id: str | None = None
    archived: bool
    admin_hidden: bool = False
    is_structure: bool = False
    attributes: dict[str, Any]
    last_synced_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
