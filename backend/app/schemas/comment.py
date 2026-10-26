"""Schemas for comments on principles and target architecture."""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

CommentSubjectType = Literal["principle", "target_architecture", "glossary_term", "nulaagesanalys", "gap_analys"]
CommentStatus = Literal["pending", "approved", "rejected"]


class CommentCreate(BaseModel):
    subject_type: CommentSubjectType
    subject_id: str = Field(..., min_length=1, max_length=255)
    body: str = Field(..., min_length=1, max_length=4000)


class CommentReview(BaseModel):
    """Admin action: approve or reject, optionally with a reply."""
    status: Literal["approved", "rejected"]
    reply: str | None = None


class CommentRead(BaseModel):
    id: UUID
    subject_type: CommentSubjectType
    subject_id: str
    body: str
    status: CommentStatus
    created_at: datetime
    created_by: str | None
    reviewed_at: datetime | None
    reviewed_by: str | None
    reply: str | None

    model_config = {"from_attributes": True}
