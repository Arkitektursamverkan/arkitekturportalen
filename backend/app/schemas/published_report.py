"""Schemas for published survey reports ("publicerade rapporter")."""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class PublishReportRequest(BaseModel):
    """Optional heading override — otherwise the report's own name is used."""
    name: str | None = Field(None, max_length=200)


class PublishedReportSummary(BaseModel):
    """One line in the "Rapporter" listing: what it is called and when it was published."""
    id: UUID
    survey_id: UUID | None
    survey_title: str
    report_number: int
    name: str
    published_at: datetime
    published_by: str | None
    # Carried in the listing so the menu can show scope without loading payloads.
    row_count: int
    matching_count: int
    answered_count: int

    model_config = {"from_attributes": True}


class PublishedReportRead(PublishedReportSummary):
    """The frozen report itself — the same shape compile_report returns."""
    payload: dict[str, Any]
