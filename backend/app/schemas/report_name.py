"""Schemas for renaming a report."""
from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class ReportRenameRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Rapporten måste ha ett namn")
        return stripped


class ReportNameRead(BaseModel):
    """One renamed report. Reports without a row keep their built-in name."""
    report_key: str
    name: str

    model_config = {"from_attributes": True}
