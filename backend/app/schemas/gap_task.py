"""Schemas for GAP-analys tasks."""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

GapTaskStatus = Literal["todo", "in_progress", "done", "cancelled"]


class GapTaskCreate(BaseModel):
    gap_item_id: str = Field(..., min_length=1, max_length=255)
    title: str = Field(..., min_length=1, max_length=500)
    description: str = ""
    assigned_to: str = ""
    due_date: date | None = None
    horizon: str = ""  # "" | "0-3" | "3-6" | "6-12"
    weight: int = Field(default=1, ge=1, le=3)  # 1 = liten, 2 = medel, 3 = stor


class GapTaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: GapTaskStatus | None = None
    assigned_to: str | None = None
    due_date: date | None = None
    horizon: str | None = None
    weight: int | None = Field(default=None, ge=1, le=3)
    # Logged with the status change, e.g. why the task was cancelled. Not stored on the task.
    status_comment: str | None = None


class GapTaskRead(BaseModel):
    id: UUID
    gap_item_id: str
    title: str
    description: str
    status: str
    assigned_to: str
    due_date: date | None
    horizon: str
    weight: int
    created_at: datetime
    created_by: str | None
    updated_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class GapStatusLogCreate(BaseModel):
    """A change of a GAP item's gap_typ; task status changes are logged by PATCH."""

    gap_item_id: str = Field(..., min_length=1, max_length=255)
    from_status: str = Field(..., max_length=50)
    to_status: str = Field(..., min_length=1, max_length=50)
    comment: str = ""


class GapStatusLogRead(BaseModel):
    id: UUID
    gap_item_id: str
    task_id: UUID | None
    task_title: str | None
    from_status: str
    to_status: str
    comment: str
    created_at: datetime
    created_by: str | None

    model_config = {"from_attributes": True}


class GapTaskItemSummary(BaseModel):
    total: int
    todo: int
    in_progress: int
    done: int
    cancelled: int
    # Summed task weights; cancelled tasks are left out of weight_active.
    weight_active: int = 0
    weight_done: int = 0
    weight_in_progress: int = 0
    last_activity: datetime | None = None


class GapTaskSummaryResponse(BaseModel):
    by_item: dict[str, GapTaskItemSummary]
