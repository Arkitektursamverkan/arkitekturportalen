"""ORM models for the business calendar (ea_calendar_events).

Recurring events that the business depends on IT for – e.g. nyckelutlämning
on the first working day of every month, when Internet, Momentum and the
printers have to work. Any signed-in user proposes an event; an editor
approves it. An event names the objects it depends on, and may carry a
change freeze: no changes that affect those who work with it, for as long as
the event's own times say.

The event is not an architecture object and stays out of ea_nodes: it has no
place in the graph, the sync or the CSV import. It only points at nodes.
"""
from __future__ import annotations

from datetime import date, datetime, time
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Time,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class CalendarEventORM(Base):
    __tablename__ = "ea_calendar_events"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # See app/services/calendar_recurrence.py for the rules.
    recurrence: Mapped[str] = mapped_column(String(30), nullable=False, default="once")
    # First date; a recurring rule reads its weekday / day of month off it.
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    # Days each occurrence runs over: 1 = a single day, 3 = the date it falls
    # on and the two days after.
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    # Last date an occurrence may start on; null = until further notice.
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Both null = all day. Over several days, start_time is on the first day
    # and end_time on the last.
    start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    # No changes that affect the event while it is on (start_time on the first
    # day to end_time on the last, or the whole days).
    change_freeze: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    responsible: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    # Departments the event concerns, by name as Entra ID has them.
    departments: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    # Dependencies that are not objects in the register, as free text.
    other_dependencies: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # proposed | approved | rejected | withdrawn
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="proposed")
    proposed_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # CurrentUser.id – lets the proposer change or withdraw their own proposal.
    proposed_by_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    resolved_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (Index("ix_ea_calendar_events_status", "status"),)


class CalendarEventNodeORM(Base):
    """An object the event depends on, or a process it belongs to."""

    __tablename__ = "ea_calendar_event_nodes"

    event_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("ea_calendar_events.id", ondelete="CASCADE"), primary_key=True
    )
    node_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("ea_nodes.id", ondelete="CASCADE"), primary_key=True
    )

    __table_args__ = (Index("ix_ea_calendar_event_nodes_node_id", "node_id"),)
