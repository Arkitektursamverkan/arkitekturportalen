"""SQLAlchemy ORM model for EA graph nodes."""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class NodeORM(Base, TimestampMixin):
    __tablename__ = "ea_nodes"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid4
    )
    type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    external_source: Mapped[str] = mapped_column(
        String(50), nullable=False, default="NONE", index=True
    )
    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Admin-toggled visibility flag — separate from sync-driven `archived`.
    admin_hidden: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    # Editorial flag: this Process is an organisational heading/chapter, not
    # an actual work process — so process counts can exclude it. Never
    # touched by sync, same as `admin_hidden`.
    is_structure: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    attributes: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        # Unique only for external nodes (NONE can repeat)
        Index(
            "uq_ea_nodes_external",
            "external_source",
            "external_id",
            unique=True,
            postgresql_where="external_source != 'NONE'",
        ),
        Index("ix_ea_nodes_name", "name"),
    )
