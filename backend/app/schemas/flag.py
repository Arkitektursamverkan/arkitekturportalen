"""Schemas for node quality flags."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel


class FlagType(str, Enum):
    INCOMPLETE = "INCOMPLETE"
    OUTDATED = "OUTDATED"
    INCORRECT = "INCORRECT"


class NodeFlagCreate(BaseModel):
    flag_type: FlagType
    description: str | None = None


class NodeFlagRespond(BaseModel):
    response: str | None = None


class NodeFlagRead(BaseModel):
    id: UUID
    node_id: UUID
    flag_type: FlagType
    description: str | None = None
    created_by: str | None = None
    created_at: datetime
    response: str | None = None
    responded_by: str | None = None
    responded_at: datetime | None = None

    model_config = {"from_attributes": True}
