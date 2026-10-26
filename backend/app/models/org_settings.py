"""The installation's organisation settings: one row, edited under Administration.

A NULL column means "not set here": the matching environment variable (see
app.config) applies, so an installation configured through .env keeps working
until an admin overrides a value."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Integer,
    LargeBinary,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class OrgSettingsORM(Base):
    __tablename__ = "ea_org_settings"
    __table_args__ = (CheckConstraint("id = 1", name="ea_org_settings_single_row"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False, default=1)
    org_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    org_short_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # "#RRGGBB"
    brand_color: Mapped[str | None] = mapped_column(String(7), nullable=True)
    # Comma-separated, as in the environment variables.
    allowed_email_domains: Mapped[str | None] = mapped_column(Text, nullable=True)
    change_log_departments: Mapped[str | None] = mapped_column(Text, nullable=True)
    anonymous_read: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    # Comma-separated module keys (app.modules); "" = none, NULL = MODULES.
    modules: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The left menu (app.schemas.navigation); NULL = the standard menu.
    navigation: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    logo: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    logo_content_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )
    updated_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
