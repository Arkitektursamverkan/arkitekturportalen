"""ORM model for user-submitted glossary term requests (ea_glossary_request)."""
from __future__ import annotations

import uuid as uuid_pkg
from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class GlossaryRequestORM(Base):
    __tablename__ = "ea_glossary_request"
    __table_args__ = (Index("ix_ea_glossary_request_status", "status"),)

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid_pkg.uuid4)
    term: Mapped[str] = mapped_column(String(255), nullable=False)
    context: Mapped[str | None] = mapped_column(Text, nullable=True)
    requested_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
