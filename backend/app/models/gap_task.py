"""ORM model for tasks linked to GAP-analys items."""
from __future__ import annotations

from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import Date, DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class GapTaskORM(Base):
    __tablename__ = "ea_gap_tasks"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    gap_item_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="todo")
    assigned_to: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    horizon: Mapped[str] = mapped_column(String(10), nullable=False, default="")
    # Omfattning: 1 = liten, 2 = medel, 3 = stor – how far the task moves its item.
    weight: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class GapStatusLogORM(Base):
    """A status change on a GAP item (gap_typ) or one of its tasks, with an optional comment."""

    __tablename__ = "ea_gap_status_log"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    gap_item_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    # Null for a change of the item's gap_typ; set for a task status change.
    task_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    # Kept so the history still reads right after the task is renamed or deleted.
    task_title: Mapped[str | None] = mapped_column(Text, nullable=True)
    from_status: Mapped[str] = mapped_column(String(50), nullable=False)
    to_status: Mapped[str] = mapped_column(String(50), nullable=False)
    comment: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
