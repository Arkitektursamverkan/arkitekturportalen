"""Schemas for proposed changes to node fields."""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class ProposedFieldChange(BaseModel):
    # "name", "description" or "attributes.<key>"
    field: str = Field(..., min_length=1, max_length=255)
    new_value: str = Field(..., max_length=4000)


class ChangeProposalCreate(BaseModel):
    changes: list[ProposedFieldChange] = Field(..., min_length=1, max_length=50)
    comment: str | None = Field(default=None, max_length=2000)


class ChangeProposalResolve(BaseModel):
    # done = the admin has made the change in the underlying list;
    # rejected = the change will not be made.
    outcome: Literal["done", "rejected"]
    note: str | None = Field(default=None, max_length=2000)


class ChangeProposalRead(BaseModel):
    id: UUID
    node_id: UUID
    node_name: str
    node_type: str
    node_source: str
    field: str
    old_value: str | None
    new_value: str
    # What the node shows NOW (i.e. what the underlying list last delivered).
    current_value: str | None
    comment: str | None
    proposed_by: str | None
    proposed_by_id: str | None
    status: str
    created_at: datetime
    resolved_by: str | None
    resolved_at: datetime | None
    resolution_note: str | None
