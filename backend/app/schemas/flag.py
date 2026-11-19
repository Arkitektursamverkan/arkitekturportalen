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
    # On a Process only, raised from the process view:
    # the DIAGRAM is wrong (it does not show the process as it is documented)
    PROCESS_IMAGE_WRONG = "PROCESS_IMAGE_WRONG"
    # the PROCESS deviates (what is done differs from what is documented)
    PROCESS_DEVIATION = "PROCESS_DEVIATION"


#: Flag types that only make sense on a Process node.
PROCESS_FLAG_TYPES = frozenset({FlagType.PROCESS_IMAGE_WRONG, FlagType.PROCESS_DEVIATION})


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
