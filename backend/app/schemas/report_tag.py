"""Schemas for report tags ("taggar") and the reports filed under them."""
from __future__ import annotations

import re
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
# One character is a perfectly good tag name ("A"), so the tail is optional.
SLUG_RE = re.compile(r"^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$")


def _check_color(value: str) -> str:
    if not HEX_COLOR_RE.match(value):
        raise ValueError("Färgen måste anges som hex, till exempel #2196F3")
    return value.upper()


class ReportTagBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    color: str = Field("#E65100", max_length=7)
    sort_order: int = Field(100, ge=0, le=9999)

    @field_validator("color")
    @classmethod
    def validate_color(cls, v: str) -> str:
        return _check_color(v)

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Taggen måste ha ett namn")
        return stripped


class ReportTagCreate(ReportTagBase):
    """A tag the user adds. The slug is derived from the name when omitted."""
    slug: str | None = Field(None, max_length=50)
    report_keys: list[str] = Field(default_factory=list, max_length=500)

    @field_validator("report_keys")
    @classmethod
    def validate_report_keys(cls, v: list[str]) -> list[str]:
        keys = [k.strip() for k in v if k.strip()]
        if any(len(k) > 120 for k in keys):
            raise ValueError("En rapportnyckel får vara högst 120 tecken")
        return keys


class ReportTagUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=60)
    color: str | None = Field(None, max_length=7)
    sort_order: int | None = Field(None, ge=0, le=9999)

    @field_validator("color")
    @classmethod
    def validate_color(cls, v: str | None) -> str | None:
        return None if v is None else _check_color(v)


class ReportTagRead(ReportTagBase):
    id: UUID
    slug: str
    # The reports filed under this tag, by their stable key ("portfolio",
    # "published:<uuid>"). Carried in the listing so the menu can group in one
    # request.
    report_keys: list[str] = Field(default_factory=list)


class ReportTagAssignment(BaseModel):
    """Replace the whole tag set of one report — the chip row saves as a unit."""
    tag_ids: list[UUID] = Field(default_factory=list)
