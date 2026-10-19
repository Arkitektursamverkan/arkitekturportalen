"""ORM model for quality flags on EA nodes."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class NodeFlagORM(Base):
    __tablename__ = "ea_node_flags"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    node_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("ea_nodes.id", ondelete="CASCADE"), nullable=False
    )
    # INCOMPLETE | OUTDATED | INCORRECT
    flag_type: Mapped[str] = mapped_column(String(30), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    response: Mapped[str | None] = mapped_column(Text, nullable=True)
    responded_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (Index("ix_ea_node_flags_node_id", "node_id"),)
