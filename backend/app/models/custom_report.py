"""ORM model for an installation's own reports."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, String, Text, func, true
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class CustomReportORM(Base):
    """A report whose CONTENT the installation supplies as data.

    The built-in reports are code: they compute something from the graph. An
    installation sometimes needs a report nobody else does — the result of a
    one-off review, say — and that does not belong in the product. It is
    loaded as rows (`PUT /custom-reports/{key}`) and shown by one of a few
    generic report kinds. See api/v1/custom_reports.py.
    """

    __tablename__ = "ea_custom_reports"

    # Stable, chosen by the installation; the last segment of the page address.
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    # What the rows mean and how they are shown. "kopplingsforslag" for now.
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    admin_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=true())
    # The rows, each with a stable `id`. A decision made in the report is
    # stored on its row (`beslut`) and survives a reload of the report.
    rows: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    updated_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
