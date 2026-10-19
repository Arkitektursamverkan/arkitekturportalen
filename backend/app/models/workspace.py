"""ORM models for Samarbete — permission-controlled workspaces.

A workspace is a small collaboration surface. `kind` says which of the two it
is: an "uppdrag" (a specific assignment, private by default) or an
"arbetsgrupp" (a standing working group — Affärsstöd, Bostad, Fastighet, IT —
internal, so every signed-in user may read it while its deltagare write). Both
kinds carry the same content: a member list with per-workspace roles, pages, meeting notes,
uploaded files, a discussion board and a task list. Membership is what grants access —
a globally ordinary user can be owner of their own uppdrag — with two
exceptions: admins see everything, and a workspace marked `internal` is
readable by any signed-in user.

Uploaded files are stored in the database (bytea) so they follow the existing
pg_dump-based backup/restore without a separate volume to keep in sync.
"""
from __future__ import annotations

from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class WorkspaceORM(Base):
    __tablename__ = "ea_workspaces"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    # uppdrag: an assignment, created by editors, private by default.
    # arbetsgrupp: a standing working group, internal, with deltagare.
    kind: Mapped[str] = mapped_column(String(20), nullable=False, server_default="uppdrag")
    # active -> archived. Archived workspaces are read-only and drop out of
    # the sidebar, but stay reachable from the uppdrag list.
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="active")
    # private: only members see it at all.
    # internal: every signed-in user may read it; only members may write.
    visibility: Mapped[str] = mapped_column(String(20), nullable=False, server_default="private")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    updated_by: Mapped[str | None] = mapped_column(String(255), nullable=True)

    __table_args__ = (
        Index("ix_ea_workspaces_status", "status"),
        Index("ix_ea_workspaces_visibility", "visibility"),
        Index("ix_ea_workspaces_kind", "kind"),
    )


class WorkspaceMemberORM(Base):
    __tablename__ = "ea_workspace_members"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    workspace_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("ea_workspaces.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("ea_users.id", ondelete="CASCADE"), nullable=False
    )
    # owner: manages members, settings and all content.
    # member: reads and writes content.
    # reader: read-only.
    role: Mapped[str] = mapped_column(String(20), nullable=False, server_default="member")
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    added_by: Mapped[str | None] = mapped_column(String(255), nullable=True)

    __table_args__ = (
        UniqueConstraint("workspace_id", "user_id", name="uq_workspace_member"),
        Index("ix_ea_workspace_members_user", "user_id"),
    )


class WorkspacePageORM(Base):
    """A document page written in the app (Markdown body)."""

    __tablename__ = "ea_workspace_pages"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    workspace_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("ea_workspaces.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    updated_by: Mapped[str | None] = mapped_column(String(255), nullable=True)

    __table_args__ = (Index("ix_ea_workspace_pages_ws", "workspace_id", "sort_order"),)


class WorkspaceMeetingORM(Base):
    """Minutes from one meeting. Started from a template (the template only
    seeds the body — `template` is kept so the list can say what kind of
    meeting it was)."""

    __tablename__ = "ea_workspace_meetings"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    workspace_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("ea_workspaces.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    meeting_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    template: Mapped[str] = mapped_column(String(40), nullable=False, server_default="blank")
    body: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    updated_by: Mapped[str | None] = mapped_column(String(255), nullable=True)

    __table_args__ = (Index("ix_ea_workspace_meetings_ws", "workspace_id", "meeting_date"),)


class WorkspaceEventORM(Base):
    """A calendar entry. `starts_at`/`ends_at` are stored with timezone; an
    all-day entry keeps midnight local time and is rendered without a clock."""

    __tablename__ = "ea_workspace_events"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    workspace_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("ea_workspaces.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    all_day: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    location: Mapped[str] = mapped_column(String(255), nullable=False, server_default="")
    description: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    updated_by: Mapped[str | None] = mapped_column(String(255), nullable=True)

    __table_args__ = (Index("ix_ea_workspace_events_ws", "workspace_id", "starts_at"),)


class WorkspaceFileORM(Base):
    """An uploaded file, or a link when `url` is set (then `data` is empty and
    `filename` holds the link title). `data` is never selected by the listing
    queries."""

    __tablename__ = "ea_workspace_files"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    workspace_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("ea_workspaces.id", ondelete="CASCADE"), nullable=False
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(
        String(150), nullable=False, server_default="application/octet-stream"
    )
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    description: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    uploaded_by: Mapped[str | None] = mapped_column(String(255), nullable=True)

    __table_args__ = (Index("ix_ea_workspace_files_ws", "workspace_id", "uploaded_at"),)


class WorkspacePostORM(Base):
    """A discussion post. A reply carries the id of the post it answers."""

    __tablename__ = "ea_workspace_posts"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    workspace_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("ea_workspaces.id", ondelete="CASCADE"), nullable=False
    )
    parent_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("ea_workspace_posts.id", ondelete="CASCADE"), nullable=True
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    author_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_ea_workspace_posts_ws", "workspace_id", "created_at"),
        Index("ix_ea_workspace_posts_parent", "parent_id"),
    )


class WorkspaceTaskORM(Base):
    __tablename__ = "ea_workspace_tasks"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    workspace_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("ea_workspaces.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    # todo -> doing -> done
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="todo")
    assignee_user_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("ea_users.id", ondelete="SET NULL"), nullable=True
    )
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    updated_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (Index("ix_ea_workspace_tasks_ws", "workspace_id", "status"),)
