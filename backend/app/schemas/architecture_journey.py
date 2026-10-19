"""Arkitekturresan: a page of steps an organisation describes its architecture work with."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

# The documents a step can carry Fastslaget/Reviderat stamps for.
JourneyDocument = Literal["nulaagesanalys", "target_architecture", "gap_analys", "principles"]
JourneyIcon = Literal[
    "assessment", "flag", "analytics", "gavel", "route", "account_tree", "storage", "description",
    "memory", "groups", "menu_book", "calendar", "checklist", "lightbulb",
]


class JourneyStep(BaseModel):
    id: str = Field(..., min_length=1, max_length=64, pattern=r"^[a-z0-9-]+$")
    title: str = Field(..., min_length=1, max_length=120)
    subtitle: str = Field("", max_length=200)
    body: str = Field("", max_length=5000)
    icon: JourneyIcon = "route"
    # A page in the portal ("/target-architecture"); the step is hidden while
    # that page's module is off.
    link_path: str | None = Field(None, max_length=200)
    link_label: str = Field("", max_length=80)
    document: JourneyDocument | None = None

    @field_validator("link_path")
    @classmethod
    def _internal_path(cls, v: str | None) -> str | None:
        if v is None or v.strip() == "":
            return None
        v = v.strip()
        if not v.startswith("/") or v.startswith("//"):
            raise ValueError("Länken ska vara en sida i portalen, t.ex. /target-architecture")
        return v


class JourneyContent(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    intro: str = Field("", max_length=2000)
    steps: list[JourneyStep] = Field(default_factory=list, max_length=20)

    @field_validator("steps")
    @classmethod
    def _unique_ids(cls, steps: list[JourneyStep]) -> list[JourneyStep]:
        ids = [s.id for s in steps]
        if len(ids) != len(set(ids)):
            raise ValueError("Varje steg ska ha ett eget id")
        return steps


class JourneyRead(BaseModel):
    content: JourneyContent
    # True while no editor has saved: the built-in steps are shown.
    is_default: bool
    updated_at: datetime | None = None
    updated_by: str | None = None
