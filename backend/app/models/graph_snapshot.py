"""ORM model for graph state snapshots (ea_graph_snapshot).

A row captures the full set of non-archived nodes and edges at a point in
time. Rows are created either manually by an admin or automatically whenever
a document version is published and the graph has changed since the previous
snapshot.
"""
from __future__ import annotations

import uuid as uuid_pkg
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import DateTime, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class GraphSnapshotORM(Base):
    __tablename__ = "ea_graph_snapshot"
    __table_args__ = (Index("ix_ea_graph_snapshot_number", "snapshot_number"),)

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid_pkg.uuid4)
    snapshot_number: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    node_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    edge_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    triggered_by: Mapped[str] = mapped_column(String(30), nullable=False, default="manual")
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    audit_entries: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, default=list
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
