"""What the installation has learned about itself: its public address and
the address Arkitekten registered (app.services.installation).

A key/value table – one row per fact – so that nothing here is mixed up with
the organisation settings an admin edits."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class InstallationFactORM(Base):
    __tablename__ = "ea_installation"

    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )
