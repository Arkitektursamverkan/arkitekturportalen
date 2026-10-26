"""SQLAlchemy ORM model for EA graph edges (directed relationships)."""
from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.node import NodeORM


class EdgeORM(Base, TimestampMixin):
    __tablename__ = "ea_edges"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid4
    )
    source_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("ea_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    target_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("ea_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    attributes: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    source: Mapped[NodeORM] = relationship("NodeORM", foreign_keys=[source_id])
    target: Mapped[NodeORM] = relationship("NodeORM", foreign_keys=[target_id])

    __table_args__ = (
        Index("ix_ea_edges_source_type", "source_id", "type"),
        Index("ix_ea_edges_target_type", "target_id", "type"),
    )
