"""ORM model for renamed reports.

The built-in reports get their names from the locale files. A row here shadows
that name for everyone, in both languages — renaming a report is an editorial
decision about what the organisation calls it, not a translation.

Only renamed reports have a row; the rest fall back to their translated name.
Published survey editions are not stored here: they already own a `name`
column, and their exports and PDF filenames read it.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ReportNameORM(Base):
    __tablename__ = "ea_report_names"

    # The report slug — the path segment after /reports/, same key the tags use.
    report_key: Mapped[str] = mapped_column(String(120), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    updated_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
