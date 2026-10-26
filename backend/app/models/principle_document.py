"""SQLAlchemy ORM model for the principle document (singleton)."""
from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class PrincipleDocumentORM(Base, TimestampMixin):
    """Free-text sections of the architecture principle document.

    Stored as a single row; the `sections` JSONB holds the editable text
    blocks (introduction, decision_forum, deviation_handling,
    target_arch_alignment). The principles themselves come from ea_nodes.
    """

    __tablename__ = "ea_principle_document"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    sections: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
