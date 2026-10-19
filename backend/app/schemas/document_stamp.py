"""Schemas for the Architecture Journey document stamps feature."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class JourneyDocumentStatus(BaseModel):
    document_type: str
    revised_at: datetime | None  # from the actual document's updated_at
    revised_by: str | None
    approved_at: datetime | None  # manually set via approval stamp
    approved_by: str | None


class JourneyStatusResponse(BaseModel):
    documents: dict[str, JourneyDocumentStatus]


class ApproveDocumentRequest(BaseModel):
    approved_by: str = ""  # who is approving (name or email)
    approved_at: datetime | None = None  # if omitted, server uses current time


class PatchStampDatesRequest(BaseModel):
    approved_at: datetime | None = None  # update Fastslaget date
    revised_at: datetime | None = None   # override Reviderat date
