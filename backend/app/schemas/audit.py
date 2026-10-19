"""Pydantic schemas for audit log."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class AuditAction(str, Enum):
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"


class AuditLogRead(BaseModel):
    id: UUID
    action: str
    entity_type: str
    entity_id: UUID
    entity_name: str | None = None
    entity_subtype: str | None = None
    snapshot_before: dict[str, Any] | None = None
    snapshot_after: dict[str, Any] | None = None
    restored: bool
    created_at: datetime
    user_name: str | None = None
    change_note: str | None = None


class AuditLogList(BaseModel):
    items: list[AuditLogRead]
    total: int


class RestoreResponse(BaseModel):
    message: str
    restored_id: UUID
