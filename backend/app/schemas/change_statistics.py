"""Schemas for the change statistics (module "changes")."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

ChangeKind = Literal["added", "updated", "removed"]


class ChangeEvent(BaseModel):
    at: datetime
    kind: ChangeKind
    node_id: str
    name: str | None
    type: str
    # Where the object comes from: NONE (entered in the portal), SHAREPOINT, 2C8, CSV …
    source: str
    # Written by a synchronisation rather than by a person.
    by_sync: bool
    # Who made the change – only for admins; None for everyone else.
    by: str | None = None
    # For "updated": the fields that changed – name, description,
    # external_source, external_id, or an attribute key.
    fields: list[str] = []


class ChangeStatistics(BaseModel):
    start: datetime
    end: datetime
    events: list[ChangeEvent]
    # More events than were returned; narrow the period or the types.
    truncated: bool
    # Objects of each type (not archived) at `end`, as far as the user may see.
    count_at_end: dict[str, int]
    # The oldest change on record: nothing before it can be counted.
    history_from: datetime | None
