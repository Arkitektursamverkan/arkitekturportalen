"""Pydantic schemas for graph snapshots."""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class GraphSnapshotListItem(BaseModel):
    id: UUID
    snapshot_number: int
    label: str | None
    node_count: int
    edge_count: int
    triggered_by: str
    audit_entries: list[dict[str, Any]]
    created_at: datetime
    created_by: str | None

    model_config = {"from_attributes": True}


class GraphSnapshotCreate(BaseModel):
    label: str | None = None
