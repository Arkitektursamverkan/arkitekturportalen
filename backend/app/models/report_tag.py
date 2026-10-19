"""ORM models for report tags — how the Rapporter menu is grouped.

A tag is a heading in the report listing ("Applikation", "Teknik", …). Which
reports sit under it is a link row keyed by the report's stable slug, not by a
foreign key: the 25 built-in reports are React pages with no database rows of
their own, and a published survey report is keyed as ``published:<uuid>`` so
both kinds can carry the same tags.
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ReportTagORM(Base):
    """One grouping heading under "Rapporter"."""

    __tablename__ = "ea_report_tags"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    # Stable machine name. The seeded tags use it to look up a Swedish/English
    # label from the locale files, so renaming the label doesn't need a migration.
    slug: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    # Hex colour for the chip and the menu heading, e.g. "#2196F3".
    color: Mapped[str] = mapped_column(String(7), nullable=False, server_default="#E65100")
    # Menu order. Ties are broken by name so the listing is never arbitrary.
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="100")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ReportTagLinkORM(Base):
    """One report carrying one tag. A report may carry several."""

    __tablename__ = "ea_report_tag_links"

    report_key: Mapped[str] = mapped_column(String(120), primary_key=True)
    tag_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("ea_report_tags.id", ondelete="CASCADE"),
        primary_key=True,
    )

    __table_args__ = (
        Index("ix_ea_report_tag_links_tag_id", "tag_id"),
    )
