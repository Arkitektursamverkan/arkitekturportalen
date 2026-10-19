"""ORM models for access to architecture objects — roles, groups and grants.

A grant says *who* gets a *role* over *which objects*:

- who: everyone signed in, everyone holding a global role (e.g. all
  superusers), the members of a group, or one user;
- role: a named bundle of permissions (ea_roles.permissions), editable by
  admins — the permission keys themselves are fixed in app/access.py;
- which objects: all of them, all objects of some types, or one object —
  for a process optionally with every sub-process under it.

Grants only ever allow; there is nothing that denies. A user's permissions on
an object are the union of every grant that reaches them. Admins (and the
API-key system user) have every permission regardless.
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class RoleORM(Base):
    __tablename__ = "ea_roles"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    # Stable identifier the seed and the code refer to (lasare, bidragsgivare, forvaltare).
    key: Mapped[str] = mapped_column(String(40), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    permissions: Mapped[list[str]] = mapped_column(JSONB, nullable=False, server_default="[]")
    # Built-in roles can be adjusted but not deleted.
    builtin: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="100")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    updated_by: Mapped[str | None] = mapped_column(String(255), nullable=True)


class GroupORM(Base):
    __tablename__ = "ea_groups"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(150), nullable=False, unique=True)
    description: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)


class GroupMemberORM(Base):
    __tablename__ = "ea_group_members"

    group_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("ea_groups.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("ea_users.id", ondelete="CASCADE"), primary_key=True
    )
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (Index("ix_ea_group_members_user", "user_id"),)


class AccessGrantORM(Base):
    __tablename__ = "ea_access_grants"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)

    # everyone | role | group | user — exactly one of the three columns below
    # is set for role, group and user.
    principal_type: Mapped[str] = mapped_column(String(20), nullable=False)
    principal_role: Mapped[str | None] = mapped_column(String(20), nullable=True)
    group_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("ea_groups.id", ondelete="CASCADE"), nullable=True
    )
    user_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("ea_users.id", ondelete="CASCADE"), nullable=True
    )

    # A role in use can't be deleted.
    role_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("ea_roles.id", ondelete="RESTRICT"), nullable=False
    )

    # all | types | node
    scope_type: Mapped[str] = mapped_column(String(10), nullable=False)
    node_types: Mapped[list[str]] = mapped_column(JSONB, nullable=False, server_default="[]")
    node_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("ea_nodes.id", ondelete="CASCADE"), nullable=True
    )
    # For a process: also every process below it in the tree.
    include_children: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    note: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)

    __table_args__ = (
        Index("ix_ea_access_grants_group", "group_id"),
        Index("ix_ea_access_grants_user", "user_id"),
        Index("ix_ea_access_grants_node", "node_id"),
    )
