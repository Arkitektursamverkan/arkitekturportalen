"""Operational announcement banners shown globally below the AppBar."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, String, Text, func, true
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class HomeBannerORM(Base):
    __tablename__ = "ea_home_banners"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # "info" | "warning" | "error" — maps directly to MUI <Alert severity=…>.
    severity: Mapped[str] = mapped_column(String(16), nullable=False, server_default="info")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=true(), default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )
    updated_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
