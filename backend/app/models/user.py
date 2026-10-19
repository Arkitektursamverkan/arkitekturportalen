"""SQLAlchemy ORM model for application users (linked to Entra ID identities)."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class UserORM(Base):
    __tablename__ = "ea_users"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    entra_oid: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="user")
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    home_shortcuts: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, server_default='["/architecture-principles", "/target-architecture", "/glossary"]'
    )

    __table_args__ = (
        CheckConstraint("role IN ('user', 'superuser', 'admin')", name="ck_ea_users_role"),
        Index("ix_ea_users_email", "email"),
        Index("ix_ea_users_role", "role"),
    )

    @property
    def is_local(self) -> bool:
        return self.password_hash is not None

    @property
    def is_provisioned(self) -> bool:
        """Pre-created by an admin; awaiting first Entra login (no oid, no password)."""
        return self.entra_oid is None and self.password_hash is None
