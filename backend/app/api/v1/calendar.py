"""Business calendar – any signed-in user proposes an event, an editor approves.

The calendar holds the recurring events the business depends on IT for, with
the objects each one needs and whether changes are frozen while it is on.
Proposals are shown to everyone alongside the approved events, marked as
proposals, so the same event is not proposed twice.

An editor's own events are approved as they are created. A proposer may
change or withdraw their proposal until it is handled. Every step is written
to ea_audit_log.
"""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.access import Policy, load_policy
from app.auth import CurrentUser
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_editor, require_user
from app.models.calendar_event import CalendarEventNodeORM, CalendarEventORM
from app.models.node import NodeORM
from app.schemas.calendar_event import (
    CalendarEventCreate,
    CalendarEventNode,
    CalendarEventRead,
    CalendarEventResolve,
    CalendarEventUpdate,
)
from app.services.calendar_recurrence import occurrences

router = APIRouter(prefix="/calendar", tags=["calendar"])

EDITOR_ROLES = ("superuser", "admin", "system")
# Statuses the calendar shows.
VISIBLE_STATUSES = ("proposed", "approved")
# Longest period occurrences are worked out for in one request.
MAX_RANGE_DAYS = 400
EVENT_FIELDS = (
    "title", "description", "recurrence", "start_date", "duration_days", "end_date",
    "start_time", "end_time", "change_freeze", "responsible", "other_dependencies", "departments",
)


def _get_pg_repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="The calendar requires PostgreSQL backend",
        )
    return repo


def _display_name(u: CurrentUser) -> str | None:
    return u.name or u.email or None


async def _linked_nodes(s: AsyncSession, event_ids: list[UUID]) -> dict[UUID, list[NodeORM]]:
    out: dict[UUID, list[NodeORM]] = {}
    if not event_ids:
        return out
    rows = (
        await s.execute(
            select(CalendarEventNodeORM.event_id, NodeORM)
            .join(NodeORM, CalendarEventNodeORM.node_id == NodeORM.id)
            .where(CalendarEventNodeORM.event_id.in_(event_ids))
            .order_by(NodeORM.name)
        )
    ).all()
    for event_id, node in rows:
        out.setdefault(event_id, []).append(node)
    return out


def _to_read(
    e: CalendarEventORM,
    nodes: list[NodeORM],
    policy: Policy,
    range_from: date | None = None,
    range_to: date | None = None,
) -> CalendarEventRead:
    return CalendarEventRead(
        id=e.id,
        title=e.title,
        description=e.description,
        recurrence=e.recurrence,
        start_date=e.start_date,
        duration_days=e.duration_days,
        end_date=e.end_date,
        start_time=e.start_time,
        end_time=e.end_time,
        change_freeze=e.change_freeze,
        responsible=e.responsible,
        other_dependencies=e.other_dependencies,
        departments=list(e.departments or []),
        nodes=[
            CalendarEventNode(id=n.id, name=n.name, type=n.type)
            for n in nodes
            if policy.can_see(n.id, n.type)
        ],
        status=e.status,
        proposed_by=e.proposed_by,
        proposed_by_id=e.proposed_by_id,
        created_at=e.created_at,
        updated_at=e.updated_at,
        resolved_by=e.resolved_by,
        resolved_at=e.resolved_at,
        resolution_note=e.resolution_note,
        occurrences=(
            # Reach back far enough to catch an occurrence that began before
            # the period and is still on in it.
            occurrences(
                e.recurrence, e.start_date, e.end_date,
                range_from - timedelta(days=e.duration_days - 1), range_to,
            )
            if range_from and range_to
            else []
        ),
    )


def _snapshot(e: CalendarEventORM, node_ids: list[UUID]) -> dict[str, Any]:
    snap: dict[str, Any] = {}
    for f in EVENT_FIELDS:
        v = getattr(e, f)
        snap[f] = v.isoformat() if hasattr(v, "isoformat") else v
    snap["status"] = e.status
    snap["proposed_by"] = e.proposed_by
    snap["node_ids"] = sorted(str(n) for n in node_ids)
    return snap


async def _node_ids(s: AsyncSession, event_id: UUID) -> list[UUID]:
    return list(
        (
            await s.execute(
                select(CalendarEventNodeORM.node_id).where(CalendarEventNodeORM.event_id == event_id)
            )
        ).scalars()
    )


async def _checked_nodes(s: AsyncSession, node_ids: list[UUID], policy: Policy) -> list[NodeORM]:
    """The nodes to link – each must exist and be visible to the user."""
    wanted = list(dict.fromkeys(node_ids))
    if not wanted:
        return []
    nodes = (await s.execute(select(NodeORM).where(NodeORM.id.in_(wanted)))).scalars().all()
    visible = {n.id: n for n in nodes if policy.can_see(n.id, n.type)}
    if len(visible) != len(wanted):
        raise HTTPException(status_code=422, detail="Ett eller flera kopplade objekt finns inte")
    return [visible[i] for i in wanted]


async def _read_one(s: AsyncSession, e: CalendarEventORM, policy: Policy) -> CalendarEventRead:
    return _to_read(e, (await _linked_nodes(s, [e.id])).get(e.id, []), policy)


async def list_pending_events(repo: PostgresRepository, policy: Policy) -> list[CalendarEventRead]:
    """All proposed events, oldest first – the admin inbox reads this."""
    async with repo._session_factory() as s:
        rows = (
            await s.execute(
                select(CalendarEventORM)
                .where(CalendarEventORM.status == "proposed")
                .order_by(CalendarEventORM.created_at.asc())
            )
        ).scalars().all()
        linked = await _linked_nodes(s, [e.id for e in rows])
    return [_to_read(e, linked.get(e.id, []), policy) for e in rows]


@router.get("/events", response_model=list[CalendarEventRead])
async def list_events(
    range_from: date | None = Query(None, alias="from"),
    range_to: date | None = Query(None, alias="to"),
    node_id: UUID | None = None,
    user: CurrentUser = Depends(require_user),
) -> list[CalendarEventRead]:
    """Proposed and approved events. With from/to, each event carries the
    start dates of the occurrences that touch that period; with node_id, only events linked to
    that object."""
    if (range_from is None) != (range_to is None):
        raise HTTPException(status_code=422, detail="Ange både from och to")
    if range_from and range_to and not 0 <= (range_to - range_from).days <= MAX_RANGE_DAYS:
        raise HTTPException(status_code=422, detail=f"Perioden får vara högst {MAX_RANGE_DAYS} dagar")
    repo = _get_pg_repo()
    policy = await load_policy(user)
    async with repo._session_factory() as s:
        q = (
            select(CalendarEventORM)
            .where(CalendarEventORM.status.in_(VISIBLE_STATUSES))
            .order_by(CalendarEventORM.title)
        )
        if node_id is not None:
            q = q.where(
                CalendarEventORM.id.in_(
                    select(CalendarEventNodeORM.event_id).where(CalendarEventNodeORM.node_id == node_id)
                )
            )
        rows = (await s.execute(q)).scalars().all()
        linked = await _linked_nodes(s, [e.id for e in rows])
    return [_to_read(e, linked.get(e.id, []), policy, range_from, range_to) for e in rows]


@router.post("/events", response_model=CalendarEventRead, status_code=status.HTTP_201_CREATED)
async def create_event(
    data: CalendarEventCreate,
    user: CurrentUser = Depends(require_user),
) -> CalendarEventRead:
    """Any signed-in user proposes; an editor's event is approved at once."""
    repo = _get_pg_repo()
    policy = await load_policy(user)
    is_editor = user.role in EDITOR_ROLES
    async with repo._session_factory() as s:
        nodes = await _checked_nodes(s, data.node_ids, policy)
        e = CalendarEventORM(
            **{f: getattr(data, f) for f in EVENT_FIELDS},
            status="approved" if is_editor else "proposed",
            proposed_by=_display_name(user),
            proposed_by_id=user.id,
        )
        e.title = e.title.strip()
        if is_editor:
            e.resolved_by = e.proposed_by
            e.resolved_at = datetime.now(UTC)
        s.add(e)
        await s.flush()
        for n in nodes:
            s.add(CalendarEventNodeORM(event_id=e.id, node_id=n.id))
        await repo._audit(
            s, "CREATE" if is_editor else "PROPOSE", "calendar_event", e.id,
            entity_name=e.title,
            snapshot_after=_snapshot(e, [n.id for n in nodes]),
            user_name=e.proposed_by,
        )
        await s.commit()
        await s.refresh(e)
        return _to_read(e, nodes, policy)


@router.put("/events/{event_id}", response_model=CalendarEventRead)
async def update_event(
    event_id: UUID,
    data: CalendarEventUpdate,
    user: CurrentUser = Depends(require_user),
) -> CalendarEventRead:
    """An editor changes any event; the proposer their own while it is a proposal."""
    repo = _get_pg_repo()
    policy = await load_policy(user)
    async with repo._session_factory() as s:
        e = await s.get(CalendarEventORM, event_id)
        if e is None or e.status not in VISIBLE_STATUSES:
            raise HTTPException(status_code=404, detail="Event not found")
        if user.role not in EDITOR_ROLES and not (e.status == "proposed" and e.proposed_by_id == user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bara den som lämnat förslaget kan ändra det, och bara tills det är hanterat",
            )
        old_ids = await _node_ids(s, e.id)
        before = _snapshot(e, old_ids)
        # Links to objects the user cannot see are not theirs to remove.
        old_nodes = (await s.execute(select(NodeORM).where(NodeORM.id.in_(old_ids)))).scalars().all() if old_ids else []
        hidden = [n.id for n in old_nodes if not policy.can_see(n.id, n.type)]
        nodes = await _checked_nodes(s, data.node_ids, policy)
        new_ids = [n.id for n in nodes] + hidden

        for f in EVENT_FIELDS:
            setattr(e, f, getattr(data, f))
        e.title = e.title.strip()
        await s.execute(delete(CalendarEventNodeORM).where(CalendarEventNodeORM.event_id == e.id))
        for nid in new_ids:
            s.add(CalendarEventNodeORM(event_id=e.id, node_id=nid))
        await repo._audit(
            s, "UPDATE", "calendar_event", e.id,
            entity_name=e.title,
            snapshot_before=before,
            snapshot_after=_snapshot(e, new_ids),
            user_name=_display_name(user),
        )
        await s.commit()
        await s.refresh(e)
        return await _read_one(s, e, policy)


@router.post("/events/{event_id}/resolve", response_model=CalendarEventRead)
async def resolve_event(
    event_id: UUID,
    data: CalendarEventResolve,
    user: CurrentUser = Depends(require_editor),
) -> CalendarEventRead:
    """An editor approves or rejects a proposal."""
    repo = _get_pg_repo()
    policy = await load_policy(user)
    async with repo._session_factory() as s:
        e = await s.get(CalendarEventORM, event_id)
        if e is None:
            raise HTTPException(status_code=404, detail="Event not found")
        if e.status != "proposed":
            raise HTTPException(status_code=409, detail="Förslaget är redan hanterat")
        node_ids = await _node_ids(s, e.id)
        before = _snapshot(e, node_ids)
        e.status = data.outcome
        e.resolved_by = _display_name(user)
        e.resolved_at = datetime.now(UTC)
        e.resolution_note = (data.note or "").strip() or None
        await repo._audit(
            s, "PROPOSE_APPROVE" if data.outcome == "approved" else "PROPOSE_REJECT",
            "calendar_event", e.id,
            entity_name=e.title,
            snapshot_before=before,
            snapshot_after=_snapshot(e, node_ids),
            user_name=e.resolved_by,
            change_note=e.resolution_note,
        )
        await s.commit()
        await s.refresh(e)
        return await _read_one(s, e, policy)


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: UUID,
    user: CurrentUser = Depends(require_user),
) -> Response:
    """The proposer withdraws their own proposal – the row stays, marked
    withdrawn. An editor removes an event from the calendar for good; the
    audit log keeps what it was."""
    repo = _get_pg_repo()
    is_editor = user.role in EDITOR_ROLES
    async with repo._session_factory() as s:
        e = await s.get(CalendarEventORM, event_id)
        if e is None or e.status not in VISIBLE_STATUSES:
            raise HTTPException(status_code=404, detail="Event not found")
        own_proposal = e.status == "proposed" and e.proposed_by_id == user.id
        if not is_editor and not own_proposal:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bara den som lämnat förslaget kan dra tillbaka det",
            )
        before = _snapshot(e, await _node_ids(s, e.id))
        if own_proposal:
            e.status = "withdrawn"
            e.resolved_by = _display_name(user)
            e.resolved_at = datetime.now(UTC)
            await repo._audit(
                s, "PROPOSE_WITHDRAW", "calendar_event", e.id,
                entity_name=e.title,
                snapshot_before=before,
                snapshot_after={**before, "status": "withdrawn"},
                user_name=e.resolved_by,
            )
        else:
            await repo._audit(
                s, "DELETE", "calendar_event", e.id,
                entity_name=e.title,
                snapshot_before=before,
                user_name=_display_name(user),
            )
            await s.delete(e)
        await s.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
