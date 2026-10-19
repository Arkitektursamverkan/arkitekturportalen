"""Schemas for anonymised usage statistics."""
from __future__ import annotations

from pydantic import BaseModel


class DailyActivity(BaseModel):
    date: str    # ISO date "2026-05-01"
    total: int
    create: int
    update: int
    delete: int
    login: int


class EntityTypeStat(BaseModel):
    label: str
    count: int


class UsageStatistics(BaseModel):
    period_days: int
    total_events: int
    active_days: int
    by_action: dict[str, int]        # {"CREATE": 100, "UPDATE": 200, "DELETE": 50, "LOGIN": 30}
    by_entity_type: list[EntityTypeStat]
    activity_by_day: list[DailyActivity]
