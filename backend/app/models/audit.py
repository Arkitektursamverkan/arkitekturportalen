"""SQLAlchemy ORM model for audit log entries."""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AuditLogORM(Base):
    __tablename__ = "ea_audit_log"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid4
    )
    action: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    entity_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False, index=True)
    entity_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    entity_subtype: Mapped[str | None] = mapped_column(String(50), nullable=True)
    snapshot_before: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    snapshot_after: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    restored: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    user_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    change_note: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
