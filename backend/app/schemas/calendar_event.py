"""Schemas for the business calendar."""
from __future__ import annotations

from datetime import date, datetime, time
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

Recurrence = Literal[
    "once",
    "weekly",
    "monthly_day",
    "monthly_nth_weekday",
    "monthly_first_workday",
    "monthly_last_workday",
    "yearly",
]


# Longest an occurrence may run before it would overlap the next one.
MAX_DURATION_DAYS: dict[str, int] = {
    "weekly": 7,
    "monthly_day": 28,
    "monthly_nth_weekday": 28,
    "monthly_first_workday": 28,
    "monthly_last_workday": 28,
    "yearly": 365,
}


class CalendarEventBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str = Field(default="", max_length=4000)
    recurrence: Recurrence = "once"
    start_date: date
    # Days each occurrence runs over; 1 = a single day.
    duration_days: int = Field(default=1, ge=1, le=366)
    end_date: date | None = None
    start_time: time | None = None
    end_time: time | None = None
    change_freeze: bool = False
    responsible: str = Field(default="", max_length=255)
    other_dependencies: str = Field(default="", max_length=2000)
    # Departments the event concerns.
    departments: list[str] = Field(default_factory=list, max_length=50)
    # Objects the event depends on, and processes it belongs to.
    node_ids: list[UUID] = Field(default_factory=list, max_length=100)

    @field_validator("departments")
    @classmethod
    def _clean_departments(cls, v: list[str]) -> list[str]:
        cleaned = [d.strip()[:255] for d in v if d.strip()]
        return list(dict.fromkeys(cleaned))

    @model_validator(mode="after")
    def _check_times(self) -> CalendarEventBase:
        if self.recurrence == "once":
            self.end_date = None
        elif self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("Slutdatum kan inte ligga före startdatum")
        if (self.start_time is None) != (self.end_time is None):
            raise ValueError("Ange både start- och sluttid, eller ingen av dem för heldag")
        if (
            self.duration_days == 1
            and self.start_time is not None
            and self.end_time is not None
            and self.end_time <= self.start_time
        ):
            raise ValueError("Sluttiden måste ligga efter starttiden")
        longest = MAX_DURATION_DAYS.get(self.recurrence)
        if longest is not None and self.duration_days > longest:
            raise ValueError("Händelsen är längre än tiden mellan två tillfällen")
        return self


class CalendarEventCreate(CalendarEventBase):
    pass


class CalendarEventUpdate(CalendarEventBase):
    """The whole event as the form holds it – the form always sends every field."""


class CalendarEventResolve(BaseModel):
    outcome: Literal["approved", "rejected"]
    note: str | None = Field(default=None, max_length=2000)


class CalendarEventNode(BaseModel):
    id: UUID
    name: str
    type: str


class CalendarEventRead(BaseModel):
    id: UUID
    title: str
    description: str
    recurrence: str
    start_date: date
    duration_days: int
    end_date: date | None
    start_time: time | None
    end_time: time | None
    change_freeze: bool
    responsible: str
    other_dependencies: str
    departments: list[str]
    # Only the linked objects the reader may see.
    nodes: list[CalendarEventNode]
    status: str
    proposed_by: str | None
    proposed_by_id: str | None
    created_at: datetime
    updated_at: datetime
    resolved_by: str | None
    resolved_at: datetime | None
    resolution_note: str | None
    # The dates the event starts on, for every occurrence that touches the
    # period asked for – so one that began before the period may be included.
    occurrences: list[date] = []
