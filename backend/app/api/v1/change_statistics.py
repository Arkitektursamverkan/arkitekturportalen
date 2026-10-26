"""Change statistics (module "changes"): how the architecture objects change over time."""
from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.access import load_policy
from app.auth import CurrentUser
from app.dal import change_statistics as changes
from app.dal.postgres_repository import SYNC_AUDIT_USER, PostgresRepository
from app.dependencies import get_repository, require_user
from app.schemas.change_statistics import ChangeEvent, ChangeStatistics

router = APIRouter(prefix="/change-statistics", tags=["change-statistics"])

# Enough for years of a large installation; past it the answer says so.
MAX_EVENTS = 50_000


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


@router.get("", response_model=ChangeStatistics)
async def get_change_statistics(
    start: datetime = Query(..., description="From this moment (inclusive)"),
    end: datetime = Query(..., description="Until this moment (exclusive)"),
    types: list[str] = Query([], description="Object types; none = every BDAT type"),
    user: CurrentUser = Depends(require_user),
) -> ChangeStatistics:
    start, end = _aware(start), _aware(end)
    if end <= start:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Slutet måste komma efter början")
    unknown = set(types) - set(changes.BDAT_TYPES)
    if unknown:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Okända objekttyper: {', '.join(sorted(unknown))}")
    wanted = [t for t in changes.BDAT_TYPES if not types or t in types]

    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Statistiken kräver PostgreSQL")

    policy = await load_policy(user)
    # A type the user reads in full needs no look at the single object; a
    # deleted object is judged by its id and type like any other.
    whole_types = {t for t in wanted if "object.read" in policy.type_perms(t)}

    def visible(node_id: str, node_type: str) -> bool:
        return node_type in whole_types or policy.can_see(node_id, node_type)

    # Events from the start until now: those after `end` take the object
    # counts of today back to what they were at `end`.
    events = [e for e in await changes.events_since(repo._session_factory, start, wanted) if visible(e.node_id, e.type)]
    in_period = [e for e in events if e.at < end]
    after = [e for e in events if e.at >= end]

    now = Counter(t for i, t in await changes.current_objects(repo._session_factory, wanted) if visible(i, t))
    net_after = Counter[str]()
    for e in after:
        if e.kind == "added":
            net_after[e.type] += 1
        elif e.kind == "removed":
            net_after[e.type] -= 1

    is_admin = user.role in ("admin", "system")
    return ChangeStatistics(
        start=start,
        end=end,
        events=[
            ChangeEvent(
                at=e.at, kind=e.kind, node_id=e.node_id, name=e.name, type=e.type, source=e.source,  # type: ignore[arg-type]
                by_sync=e.by == SYNC_AUDIT_USER, by=e.by if is_admin else None, fields=e.fields,
            )
            for e in in_period[:MAX_EVENTS]
        ],
        truncated=len(in_period) > MAX_EVENTS,
        count_at_end={t: max(0, now[t] - net_after[t]) for t in wanted},
        history_from=await changes.history_from(repo._session_factory),
    )
