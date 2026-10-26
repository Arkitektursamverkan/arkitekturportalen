"""ORM model for versioned snapshots of exportable documents.

A row is created lazily when a user exports a document and there are
unsnapshotted audit entries since the last version. If no changes are
present, no new row is created and the latest version is reused.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class DocumentVersionORM(Base):
    __tablename__ = "ea_document_version"
    __table_args__ = (
        UniqueConstraint(
            "document_type",
            "version_major",
            "version_minor",
            name="uq_document_version",
        ),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    document_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    version_major: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    version_minor: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_major: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    audit_entries: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, default=list
    )
    change_summary: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
