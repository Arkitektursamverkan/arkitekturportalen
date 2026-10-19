"""Schemas for Samarbete — uppdrag and arbetsgrupper (workspaces)."""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

WorkspaceStatus = Literal["active", "archived"]
# uppdrag: an assignment. arbetsgrupp: a standing working group.
WorkspaceKind = Literal["uppdrag", "arbetsgrupp"]
WorkspaceVisibility = Literal["private", "internal"]
MemberRole = Literal["owner", "member", "reader"]
TaskStatus = Literal["todo", "doing", "done"]

# What the signed-in user may do in a workspace. "owner" is also what an
# admin gets everywhere; "reader" is what an internal workspace grants to
# non-members.
EffectiveRole = Literal["owner", "member", "reader"]


# ── Workspace ───────────────────────────────────────────────────────────────

class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str = ""
    kind: WorkspaceKind = "uppdrag"
    visibility: WorkspaceVisibility = "private"
    # Users to add as members right away, besides the creator (who is owner).
    member_ids: list[UUID] = Field(default_factory=list, max_length=200)


class WorkspaceUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    status: WorkspaceStatus | None = None
    visibility: WorkspaceVisibility | None = None


class WorkspaceSummary(BaseModel):
    id: UUID
    name: str
    description: str
    kind: WorkspaceKind
    status: WorkspaceStatus
    visibility: WorkspaceVisibility
    my_role: EffectiveRole
    # True when my_role comes from an actual membership row rather than from
    # being admin or from the workspace being internal.
    is_member: bool
    member_count: int
    created_at: datetime
    created_by: str | None
    updated_at: datetime
    updated_by: str | None


class WorkspaceRead(WorkspaceSummary):
    members: list["MemberRead"]


# ── Members ─────────────────────────────────────────────────────────────────

class MemberAdd(BaseModel):
    user_id: UUID
    role: MemberRole = "member"


class MemberUpdate(BaseModel):
    role: MemberRole


class MemberRead(BaseModel):
    user_id: UUID
    name: str
    email: str
    role: MemberRole
    added_at: datetime
    added_by: str | None


class DirectoryUser(BaseModel):
    """Minimal user record for the member picker."""
    id: UUID
    name: str
    email: str


# ── Document pages ──────────────────────────────────────────────────────────

class PageCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    body: str = ""


class PageUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    body: str | None = None
    sort_order: int | None = None


class PageSummary(BaseModel):
    id: UUID
    title: str
    sort_order: int
    updated_at: datetime
    updated_by: str | None

    model_config = {"from_attributes": True}


class PageRead(PageSummary):
    workspace_id: UUID
    body: str
    created_at: datetime
    created_by: str | None

    model_config = {"from_attributes": True}


# ── Calendar ────────────────────────────────────────────────────────────────

class EventCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    starts_at: datetime
    ends_at: datetime | None = None
    all_day: bool = False
    location: str = Field("", max_length=255)
    description: str = ""


class EventUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    starts_at: datetime | None = None
    # Explicit null clears the end time, so this cannot use a plain default.
    ends_at: datetime | None = None
    all_day: bool | None = None
    location: str | None = Field(None, max_length=255)
    description: str | None = None


class EventRead(BaseModel):
    id: UUID
    workspace_id: UUID
    title: str
    starts_at: datetime
    ends_at: datetime | None
    all_day: bool
    location: str
    description: str
    created_at: datetime
    created_by: str | None
    updated_at: datetime
    updated_by: str | None

    model_config = {"from_attributes": True}


# ── Meetings ────────────────────────────────────────────────────────────────

class MeetingCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    meeting_date: date | None = None
    # Which template seeded the body; free-form so the frontend owns the set.
    template: str = Field("blank", max_length=40)
    body: str = ""


class MeetingUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    meeting_date: date | None = None
    body: str | None = None


class MeetingSummary(BaseModel):
    id: UUID
    title: str
    meeting_date: date | None
    template: str
    updated_at: datetime
    updated_by: str | None

    model_config = {"from_attributes": True}


class MeetingRead(MeetingSummary):
    workspace_id: UUID
    body: str
    created_at: datetime
    created_by: str | None

    model_config = {"from_attributes": True}


# ── Files ───────────────────────────────────────────────────────────────────

class FileRead(BaseModel):
    id: UUID
    workspace_id: UUID
    filename: str
    content_type: str
    size_bytes: int
    description: str
    uploaded_at: datetime
    uploaded_by: str | None
    url: str | None = None

    model_config = {"from_attributes": True}


class LinkCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    url: str = Field(..., min_length=1, max_length=2000)
    description: str = Field("", max_length=5000)

    @field_validator("url")
    @classmethod
    def _check_url(cls, v: str) -> str:
        """Only web links — a javascript: or file: URL must never reach an <a href>."""
        v = v.strip()
        if not v.lower().startswith(("https://", "http://")):
            raise ValueError("Länken måste börja med https:// eller http://")
        return v


# ── Discussion ──────────────────────────────────────────────────────────────

class PostCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=20000)
    parent_id: UUID | None = None


class PostUpdate(BaseModel):
    body: str = Field(..., min_length=1, max_length=20000)


class PostRead(BaseModel):
    id: UUID
    workspace_id: UUID
    parent_id: UUID | None
    body: str
    created_at: datetime
    created_by: str | None
    author_name: str | None
    edited_at: datetime | None

    model_config = {"from_attributes": True}


# ── Tasks ───────────────────────────────────────────────────────────────────

class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str = ""
    assignee_user_id: UUID | None = None
    due_date: date | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    status: TaskStatus | None = None
    # Explicit null clears the assignee, so the caller's intent is carried in
    # the field's presence — see `model_fields_set` handling in the endpoint.
    assignee_user_id: UUID | None = None
    due_date: date | None = None
    sort_order: int | None = None


class TaskRead(BaseModel):
    id: UUID
    workspace_id: UUID
    title: str
    description: str
    status: TaskStatus
    assignee_user_id: UUID | None
    assignee_name: str | None
    due_date: date | None
    sort_order: int
    created_at: datetime
    created_by: str | None
    updated_at: datetime
    updated_by: str | None
    completed_at: datetime | None


WorkspaceRead.model_rebuild()
