"""Change log – changes to the IT environment, logged from the business calendar.

Everyone signed in reads the log. Entries are written by the departments
named in the organisation settings (or CHANGE_LOG_DEPARTMENTS), as the
Entra ID directory copy places people, and by admins.

A change that falls on an approved business event in the calendar is refused
unless the request carries the active choice to go ahead anyway
(conflict_override); who made that choice is kept on the entry. Every write
goes to ea_audit_log.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.access import Policy, load_policy
from app.auth import CurrentUser
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_user
from app.models.calendar_event import CalendarEventNodeORM, CalendarEventORM
from app.models.change_entry import ChangeEntryNodeORM, ChangeEntryORM
from app.models.directory import DirectoryPersonORM
from app.models.node import NodeORM
from app.schemas.change_entry import (
    ChangeConflict,
    ChangeConflictCheck,
    ChangeEntryNode,
    ChangeEntryRead,
    ChangeEntryWrite,
    ChangeLogPermissions,
)
from app.services.calendar_recurrence import occurrences
from app.services import org_settings

router = APIRouter(prefix="/change-log", tags=["change-log"])

# What a change can be linked to.
LINKABLE_TYPES = ("Application", "TechnologyComponent")
ENTRY_FIELDS = (
    "title", "starts_at", "ends_at", "affected_share", "user_impact", "change_type",
    "description", "impact", "risks", "notify_departments", "approval_status", "approved_by",
)


def _get_pg_repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="The change log requires PostgreSQL backend",
        )
    return repo


def _display_name(u: CurrentUser) -> str | None:
    return u.name or u.email or None


async def can_manage(repo: PostgresRepository, user: CurrentUser) -> bool:
    """Admins, and people the directory places in a change-log department."""
    if user.role in ("admin", "system"):
        return True
    departments = {d.casefold() for d in org_settings.current().change_log_departments}
    if not user.email or not departments:
        return False
    async with repo._session_factory() as s:
        department = (
            await s.execute(
                select(DirectoryPersonORM.department)
                .where(func.lower(DirectoryPersonORM.email) == user.email.lower())
            )
        ).scalars().first()
    return department is not None and department.casefold() in departments


async def _require_manager(repo: PostgresRepository, user: CurrentUser) -> None:
    if not await can_manage(repo, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bara administratörer och avdelningarna som har behörighet kan ändra i förändringsloggen",
        )


async def find_conflicts(
    s: AsyncSession, starts_at: datetime, ends_at: datetime | None, node_ids: list[UUID],
) -> list[ChangeConflict]:
    """Approved business events that are on at some point during the change."""
    change_end = ends_at or starts_at
    events = (
        await s.execute(select(CalendarEventORM).where(CalendarEventORM.status == "approved"))
    ).scalars().all()
    hits: list[tuple[CalendarEventORM, date]] = []
    for e in events:
        days = timedelta(days=e.duration_days - 1)
        for first_day in occurrences(
            e.recurrence, e.start_date, e.end_date, starts_at.date() - days, change_end.date(),
        ):
            event_start = datetime.combine(first_day, e.start_time or time.min)
            last_day = first_day + days
            # A whole-day event runs to midnight after its last day.
            event_end = (
                datetime.combine(last_day, e.end_time) if e.end_time
                else datetime.combine(last_day + timedelta(days=1), time.min)
            )
            # The change may be a point in time, so its own end is inclusive.
            if event_start <= change_end and starts_at < event_end:
                hits.append((e, first_day))
    if not hits:
        return []

    wanted = set(node_ids)
    names: dict[UUID, list[str]] = {}
    if wanted:
        rows = (
            await s.execute(
                select(CalendarEventNodeORM.event_id, NodeORM.name)
                .join(NodeORM, CalendarEventNodeORM.node_id == NodeORM.id)
                .where(
                    CalendarEventNodeORM.event_id.in_({e.id for e, _ in hits}),
                    CalendarEventNodeORM.node_id.in_(wanted),
                )
                .order_by(NodeORM.name)
            )
        ).all()
        for event_id, name in rows:
            names.setdefault(event_id, []).append(name)
    return [
        ChangeConflict(
            event_id=e.id,
            title=e.title,
            start_date=first_day,
            end_date=first_day + timedelta(days=e.duration_days - 1),
            start_time=e.start_time,
            end_time=e.end_time,
            change_freeze=e.change_freeze,
            shared_nodes=names.get(e.id, []),
        )
        for e, first_day in sorted(hits, key=lambda h: (h[1], h[0].title))
    ]


async def _linked_nodes(s: AsyncSession, entry_ids: list[UUID]) -> dict[UUID, list[NodeORM]]:
    out: dict[UUID, list[NodeORM]] = {}
    if not entry_ids:
        return out
    rows = (
        await s.execute(
            select(ChangeEntryNodeORM.entry_id, NodeORM)
            .join(NodeORM, ChangeEntryNodeORM.node_id == NodeORM.id)
            .where(ChangeEntryNodeORM.entry_id.in_(entry_ids))
            .order_by(NodeORM.name)
        )
    ).all()
    for entry_id, node in rows:
        out.setdefault(entry_id, []).append(node)
    return out


async def _to_read(s: AsyncSession, e: ChangeEntryORM, nodes: list[NodeORM], policy: Policy) -> ChangeEntryRead:
    return ChangeEntryRead(
        **{f: getattr(e, f) for f in ENTRY_FIELDS},
        id=e.id,
        nodes=[
            ChangeEntryNode(id=n.id, name=n.name, type=n.type)
            for n in nodes
            if policy.can_see(n.id, n.type)
        ],
        conflict_override=e.conflict_override,
        conflict_override_by=e.conflict_override_by,
        conflicts=await find_conflicts(s, e.starts_at, e.ends_at, [n.id for n in nodes]),
        created_by=e.created_by,
        created_at=e.created_at,
        updated_at=e.updated_at,
    )


def _snapshot(e: ChangeEntryORM, node_ids: list[UUID]) -> dict[str, Any]:
    snap: dict[str, Any] = {}
    for f in ENTRY_FIELDS:
        v = getattr(e, f)
        snap[f] = v.isoformat() if hasattr(v, "isoformat") else v
    snap["conflict_override"] = e.conflict_override
    snap["node_ids"] = sorted(str(n) for n in node_ids)
    return snap


async def _checked_nodes(s: AsyncSession, node_ids: list[UUID], policy: Policy) -> list[NodeORM]:
    wanted = list(dict.fromkeys(node_ids))
    if not wanted:
        return []
    nodes = (await s.execute(select(NodeORM).where(NodeORM.id.in_(wanted)))).scalars().all()
    ok = {n.id: n for n in nodes if n.type in LINKABLE_TYPES and policy.can_see(n.id, n.type)}
    if len(ok) != len(wanted):
        raise HTTPException(
            status_code=422,
            detail="En förändring kan bara kopplas till applikationer och teknikkomponenter som finns",
        )
    return [ok[i] for i in wanted]


async def _apply(
    s: AsyncSession, e: ChangeEntryORM, data: ChangeEntryWrite, nodes: list[NodeORM], user: CurrentUser,
) -> None:
    """Write the form onto the entry – refusing a change that falls on a
    business event unless the choice to go ahead has been made."""
    conflicts = await find_conflicts(s, data.starts_at, data.ends_at, [n.id for n in nodes])
    if conflicts and not data.conflict_override:
        titles = ", ".join(dict.fromkeys(c.title for c in conflicts))
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Förändringen krockar med verksamhetskalendern ({titles}). Välj aktivt att genomföra den ändå.",
        )
    for f in ENTRY_FIELDS:
        setattr(e, f, getattr(data, f))
    e.title = e.title.strip()
    e.approved_by = e.approved_by.strip()
    overridden = bool(conflicts)
    if overridden and not e.conflict_override:
        e.conflict_override_by = _display_name(user)
    elif not overridden:
        e.conflict_override_by = None
    e.conflict_override = overridden


@router.get("/permissions", response_model=ChangeLogPermissions)
async def my_permissions(user: CurrentUser = Depends(require_user)) -> ChangeLogPermissions:
    return ChangeLogPermissions(can_manage=await can_manage(_get_pg_repo(), user))


@router.post("/conflicts", response_model=list[ChangeConflict])
async def check_conflicts(
    data: ChangeConflictCheck,
    _user: CurrentUser = Depends(require_user),
) -> list[ChangeConflict]:
    """What a change at this time would fall on – asked while the form is filled in."""
    repo = _get_pg_repo()
    async with repo._session_factory() as s:
        return await find_conflicts(s, data.starts_at, data.ends_at, data.node_ids)


@router.get("/entries", response_model=list[ChangeEntryRead])
async def list_entries(
    range_from: date | None = Query(None, alias="from"),
    range_to: date | None = Query(None, alias="to"),
    user: CurrentUser = Depends(require_user),
) -> list[ChangeEntryRead]:
    """Newest first. With from/to, the changes that are on at some point in the period."""
    repo = _get_pg_repo()
    policy = await load_policy(user)
    async with repo._session_factory() as s:
        q = select(ChangeEntryORM).order_by(ChangeEntryORM.starts_at.desc()).limit(1000)
        if range_to is not None:
            q = q.where(ChangeEntryORM.starts_at < datetime.combine(range_to + timedelta(days=1), time.min))
        if range_from is not None:
            q = q.where(
                func.coalesce(ChangeEntryORM.ends_at, ChangeEntryORM.starts_at)
                >= datetime.combine(range_from, time.min)
            )
        rows = (await s.execute(q)).scalars().all()
        linked = await _linked_nodes(s, [e.id for e in rows])
        return [await _to_read(s, e, linked.get(e.id, []), policy) for e in rows]


@router.post("/entries", response_model=ChangeEntryRead, status_code=status.HTTP_201_CREATED)
async def create_entry(
    data: ChangeEntryWrite,
    user: CurrentUser = Depends(require_user),
) -> ChangeEntryRead:
    repo = _get_pg_repo()
    await _require_manager(repo, user)
    policy = await load_policy(user)
    async with repo._session_factory() as s:
        nodes = await _checked_nodes(s, data.node_ids, policy)
        e = ChangeEntryORM(created_by=_display_name(user), conflict_override=False)
        await _apply(s, e, data, nodes, user)
        s.add(e)
        await s.flush()
        for n in nodes:
            s.add(ChangeEntryNodeORM(entry_id=e.id, node_id=n.id))
        await repo._audit(
            s, "CREATE", "change_entry", e.id,
            entity_name=e.title,
            snapshot_after=_snapshot(e, [n.id for n in nodes]),
            user_name=e.created_by,
        )
        await s.commit()
        await s.refresh(e)
        return await _to_read(s, e, nodes, policy)


@router.put("/entries/{entry_id}", response_model=ChangeEntryRead)
async def update_entry(
    entry_id: UUID,
    data: ChangeEntryWrite,
    user: CurrentUser = Depends(require_user),
) -> ChangeEntryRead:
    repo = _get_pg_repo()
    await _require_manager(repo, user)
    policy = await load_policy(user)
    async with repo._session_factory() as s:
        e = await s.get(ChangeEntryORM, entry_id)
        if e is None:
            raise HTTPException(status_code=404, detail="Entry not found")
        old_ids = list(
            (await s.execute(select(ChangeEntryNodeORM.node_id).where(ChangeEntryNodeORM.entry_id == e.id))).scalars()
        )
        before = _snapshot(e, old_ids)
        nodes = await _checked_nodes(s, data.node_ids, policy)
        await _apply(s, e, data, nodes, user)
        await s.execute(delete(ChangeEntryNodeORM).where(ChangeEntryNodeORM.entry_id == e.id))
        for n in nodes:
            s.add(ChangeEntryNodeORM(entry_id=e.id, node_id=n.id))
        await repo._audit(
            s, "UPDATE", "change_entry", e.id,
            entity_name=e.title,
            snapshot_before=before,
            snapshot_after=_snapshot(e, [n.id for n in nodes]),
            user_name=_display_name(user),
        )
        await s.commit()
        await s.refresh(e)
        return await _to_read(s, e, nodes, policy)


@router.delete("/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(
    entry_id: UUID,
    user: CurrentUser = Depends(require_user),
) -> Response:
    repo = _get_pg_repo()
    await _require_manager(repo, user)
    async with repo._session_factory() as s:
        e = await s.get(ChangeEntryORM, entry_id)
        if e is None:
            raise HTTPException(status_code=404, detail="Entry not found")
        node_ids = list(
            (await s.execute(select(ChangeEntryNodeORM.node_id).where(ChangeEntryNodeORM.entry_id == e.id))).scalars()
        )
        await repo._audit(
            s, "DELETE", "change_entry", e.id,
            entity_name=e.title,
            snapshot_before=_snapshot(e, node_ids),
            user_name=_display_name(user),
        )
        await s.delete(e)
        await s.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
