"""ORM model for a published survey report — a report frozen at a point in time."""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PublishedReportORM(Base):
    """One published edition of a survey report.

    `payload` is the whole compiled report as it looked when it was published
    (see services.survey_report.compile_report) — answers keep coming in after
    publication, and a published report is meant to stay the document someone
    referred to on that date. Nothing here is recomputed on read.
    """

    __tablename__ = "ea_published_reports"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    # Kept for "publish a new edition of this report", but a published report
    # outlives its survey: the payload stands on its own, so deleting the
    # survey clears the link instead of the edition.
    survey_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("ea_surveys.id", ondelete="SET NULL"), nullable=True
    )
    # Copied so the listing keeps working once the link is gone.
    survey_title: Mapped[str] = mapped_column(String(255), nullable=False, server_default="")
    report_number: Mapped[int] = mapped_column(Integer, nullable=False)
    # The heading shown under "Rapporter" — defaults to the report's name.
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    published_by: Mapped[str | None] = mapped_column(String(255), nullable=True)

    __table_args__ = (
        Index("ix_ea_published_reports_published_at", "published_at"),
        Index("ix_ea_published_reports_survey_id", "survey_id"),
    )
