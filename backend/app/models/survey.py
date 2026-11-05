"""ORM model for admin-authored surveys ("enkäter")."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import Boolean, Date, DateTime, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SurveyORM(Base):
    __tablename__ = "ea_surveys"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    # draft -> open <-> paused -> closed. Paused: no new distribution (no
    # launches, no random-survey offers), but already-launched recipients can
    # still answer — unlike closed, which rejects further answers.
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="draft")
    # standard: admin resolves recipients and launches to them.
    # random_system: no pre-resolved recipients — logged-in users are offered
    # a randomly picked system to answer about (immutable after creation).
    kind: Mapped[str] = mapped_column(String(20), nullable=False, server_default="standard")
    # Node type whose attribute identifies recipients (e.g. "Application")
    target_node_type: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="Application"
    )
    # Node attribute key holding the raw recipient name/email (e.g. "systemförvaltare")
    target_attribute_key: Mapped[str] = mapped_column(
        String(100), nullable=False, server_default="systemförvaltare"
    )
    questions: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, server_default="[]")
    # Report definitions: one entry per used slot (1-5), holding the slot's
    # name and the conditions a response must meet to be included. Which
    # questions a report covers is tagged on the questions themselves.
    # Both stay editable after publication — a report is a way of reading
    # answers, not part of what respondents were asked.
    reports: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, server_default="[]")
    # When true, a recipient can keep re-submitting updated answers for as
    # long as the survey stays open — including after their response has
    # already been reviewed — instead of being locked after one submission.
    allow_multiple_responses: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    # Optional "bäst före": the date recipients are asked to answer by.
    # Informational only — the survey does not close automatically.
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Optional: the survey is answered in another app (a web address or a
    # path on this server) that submits through the API. "Mina enkäter"
    # opens it instead of the built-in form. NULL = the built-in form.
    answer_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # When false (default), recipient resolution skips nodes whose status
    # attribute is "Avvecklat" (decommissioned systems).
    include_decommissioned: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    updated_by: Mapped[str | None] = mapped_column(String(255), nullable=True)

    __table_args__ = (
        Index("ix_ea_surveys_status", "status"),
        Index("ix_ea_surveys_updated_at", "updated_at"),
    )
