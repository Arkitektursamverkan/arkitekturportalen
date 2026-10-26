"""ORM model for survey response slots — one row per (survey, system)."""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SurveyResponseORM(Base):
    __tablename__ = "ea_survey_responses"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    survey_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("ea_surveys.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Null for manually-added recipients not tied to any object — a survey
    # can be sent straight to a person with no system/process attached.
    node_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("ea_nodes.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    # Verbatim snapshot of the node's target attribute value at resolution time
    raw_target_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    assigned_user_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("ea_users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # matched | ambiguous | unmatched | manual | random
    match_status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="unmatched")
    # draft -> pending -> submitted -> reviewed
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="draft")
    answers: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")
    token: Mapped[str] = mapped_column(String(64), nullable=False)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    submitted_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        # Standard surveys: one slot per (survey, node). Random-system
        # surveys ("random" rows): one slot per (survey, node, user) since
        # many users may each answer about the same system.
        Index(
            "uq_ea_survey_responses_survey_node",
            "survey_id",
            "node_id",
            unique=True,
            postgresql_where=text("match_status <> 'random'"),
        ),
        Index(
            "uq_ea_survey_responses_survey_node_user",
            "survey_id",
            "node_id",
            "assigned_user_id",
            unique=True,
            postgresql_where=text("match_status = 'random'"),
        ),
        Index("ix_ea_survey_responses_token", "token", unique=True),
        Index("ix_ea_survey_responses_status", "status"),
    )
