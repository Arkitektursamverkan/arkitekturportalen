"""Schemas for the change log."""
from __future__ import annotations

from datetime import date, datetime, time
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

AffectedShare = Literal["none", "lt25", "25to50", "50to75", "gt75"]
UserImpact = Literal["none", "low", "medium", "high"]
ChangeType = Literal["emergency", "normal", "standard"]
ApprovalStatus = Literal["pending", "approved", "rejected"]


class ChangeWindow(BaseModel):
    """When the change happens – local wall-clock time, no time zone."""

    starts_at: datetime
    ends_at: datetime | None = None

    @field_validator("starts_at", "ends_at")
    @classmethod
    def _naive(cls, v: datetime | None) -> datetime | None:
        return v.replace(tzinfo=None) if v is not None else None

    @model_validator(mode="after")
    def _check_window(self) -> "ChangeWindow":
        if self.ends_at is not None and self.ends_at < self.starts_at:
            raise ValueError("Sluttiden kan inte ligga före starttiden")
        return self


class ChangeConflictCheck(ChangeWindow):
    # The applications and components the change touches – to point out
    # which business events depend on the same ones.
    node_ids: list[UUID] = Field(default_factory=list, max_length=100)


class ChangeEntryWrite(ChangeWindow):
    title: str = Field(..., min_length=1, max_length=255)
    affected_share: AffectedShare = "none"
    user_impact: UserImpact = "none"
    change_type: ChangeType = "normal"
    description: str = Field(default="", max_length=8000)
    impact: str = Field(default="", max_length=8000)
    risks: str = Field(default="", max_length=8000)
    notify_departments: list[str] = Field(default_factory=list, max_length=200)
    approval_status: ApprovalStatus = "pending"
    approved_by: str = Field(default="", max_length=255)
    # Applications and technology components the change touches.
    node_ids: list[UUID] = Field(default_factory=list, max_length=100)
    # The active choice to go ahead although the change falls on a business
    # event. Without it such a change is refused.
    conflict_override: bool = False

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Ange en rubrik")
        return v

    @field_validator("notify_departments")
    @classmethod
    def _clean_departments(cls, v: list[str]) -> list[str]:
        return list(dict.fromkeys(d.strip()[:255] for d in v if d.strip()))


class ChangeConflict(BaseModel):
    """A business event the change falls on."""

    event_id: UUID
    title: str
    # The occurrence's first and last day, and its times (null = whole days).
    start_date: date
    end_date: date
    start_time: time | None
    end_time: time | None
    change_freeze: bool
    # Objects both the event and the change name.
    shared_nodes: list[str]


class ChangeEntryNode(BaseModel):
    id: UUID
    name: str
    type: str


class ChangeEntryRead(BaseModel):
    id: UUID
    title: str
    starts_at: datetime
    ends_at: datetime | None
    affected_share: str
    user_impact: str
    change_type: str
    description: str
    impact: str
    risks: str
    notify_departments: list[str]
    approval_status: str
    approved_by: str
    nodes: list[ChangeEntryNode]
    conflict_override: bool
    conflict_override_by: str | None
    # Business events the change falls on right now.
    conflicts: list[ChangeConflict]
    created_by: str | None
    created_at: datetime
    updated_at: datetime


class ChangeLogPermissions(BaseModel):
    can_manage: bool
