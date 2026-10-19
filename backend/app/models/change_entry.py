"""ORM models for the change log (ea_change_entries).

A planned or performed change to the IT environment, logged by IT- och
Informationsarkitektur from the business calendar: when, how many it
affects, how much, what kind of change, which applications and technology
components, who should be told, and whether it is approved. A change that
falls on a business event in the calendar can only be saved with an active
choice to go ahead anyway, and that choice is kept on the entry.

Times are local wall-clock times without time zone, like the calendar's.
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ChangeEntryORM(Base):
    __tablename__ = "ea_change_entries"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False)
    # Null = a point in time.
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    # Share of people affected: none | lt25 | 25to50 | 50to75 | gt75
    affected_share: Mapped[str] = mapped_column(String(10), nullable=False, default="none")
    # none | low | medium | high
    user_impact: Mapped[str] = mapped_column(String(10), nullable=False, default="none")
    # emergency | normal | standard
    change_type: Mapped[str] = mapped_column(String(10), nullable=False, default="normal")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    impact: Mapped[str] = mapped_column(Text, nullable=False, default="")
    risks: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Departments to notify, by name as Entra ID has them.
    notify_departments: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    # pending | approved | rejected
    approval_status: Mapped[str] = mapped_column(String(10), nullable=False, default="pending")
    approved_by: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    # The change falls on a business event and goes ahead regardless.
    conflict_override: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    conflict_override_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (Index("ix_ea_change_entries_starts_at", "starts_at"),)


class ChangeEntryNodeORM(Base):
    """An application or technology component the change touches."""

    __tablename__ = "ea_change_entry_nodes"

    entry_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("ea_change_entries.id", ondelete="CASCADE"), primary_key=True
    )
    node_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("ea_nodes.id", ondelete="CASCADE"), primary_key=True
    )

    __table_args__ = (Index("ix_ea_change_entry_nodes_node_id", "node_id"),)
