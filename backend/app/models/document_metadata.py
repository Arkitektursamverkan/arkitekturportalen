"""ORM model for editable PDF footer metadata per document type.

One row per document_type. The `entries` JSONB is an ordered list of
{label, value} pairs that are rendered in the PDF footer's left column.
Auto-derived fields (Dokumentnamn, Uppdaterad, Fastställd av,
Fastställandedatum) are rendered separately and not stored here.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class DocumentMetadataORM(Base):
    __tablename__ = "ea_document_metadata"

    document_type: Mapped[str] = mapped_column(String(50), primary_key=True)
    entries: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, default=list
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    updated_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
