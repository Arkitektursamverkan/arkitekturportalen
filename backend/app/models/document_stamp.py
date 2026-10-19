"""SQLAlchemy ORM model for document approval stamps (ea_document_stamps)."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class DocumentStampORM(Base):
    """One row per document type; stores the manually set 'Fastslaget' approval."""

    __tablename__ = "ea_document_stamps"

    document_type: Mapped[str] = mapped_column(String(100), primary_key=True)
    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    approved_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    revised_at_override: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
