"""Arkitekturresan: the steps of the journey page, edited by editors.

One row; no row means the built-in default (app.services.architecture_journey)."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ArchitectureJourneyORM(Base):
    __tablename__ = "ea_architecture_journey"
    __table_args__ = (CheckConstraint("id = 1", name="ea_architecture_journey_single_row"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False, default=1)
    # {"title", "intro", "steps": [...]} — see app.schemas.architecture_journey.
    content: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )
    updated_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
