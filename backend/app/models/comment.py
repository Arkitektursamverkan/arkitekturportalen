"""ORM model for comments on principles and target architecture sections."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class CommentORM(Base):
    __tablename__ = "ea_comments"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    # "principle" or "target_architecture" — what the comment refers to
    subject_type: Mapped[str] = mapped_column(String(40), nullable=False)
    # For principle: the principle UUID as text. For target architecture: a
    # stable section identifier ("background", "overall-vision",
    # "domain-business", etc.).
    subject_id: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # pending → approved | rejected. Only approved comments are public.
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="pending")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reply: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        CheckConstraint("status IN ('pending', 'approved', 'rejected')", name="ck_ea_comments_status"),
        Index("ix_ea_comments_subject", "subject_type", "subject_id"),
        Index("ix_ea_comments_status", "status"),
    )
