"""Proposed changes to domain objects – any role proposes, admin handles.

A proposal never writes to the node. Most nodes are synced from a list
(SharePoint, 2C8 …), so a direct edit would be overwritten on the next sync
anyway: the change has to be made in the list. The proposal is the message to
the admin that it should be; until the admin marks it handled, the UI shows
the node's current value struck through with the proposed one above it.

Every step – proposed, done, rejected, withdrawn – is written to
ea_audit_log, which is the record kept for good.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select

from app.access import ensure_visible, load_policy
from app.auth import CurrentUser
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_editor, require_user
from app.models.change_proposal import ChangeProposalORM
from app.models.node import NodeORM
from app.schemas.change_proposal import (
    ChangeProposalCreate,
    ChangeProposalRead,
    ChangeProposalResolve,
)

node_router = APIRouter(prefix="/nodes", tags=["change-proposals"])
router = APIRouter(prefix="/change-proposals", tags=["change-proposals"])

EDITOR_ROLES = ("superuser", "admin", "system")


def _get_pg_repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Change proposals require PostgreSQL backend",
        )
    return repo


def _display_name(u: CurrentUser) -> str | None:
    return u.name or u.email or None


def _as_text(v: Any) -> str | None:
    """Render a stored value the way the UI shows it (String(v) in JS)."""
    if v is None:
        return None
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (list, tuple)):
        return ",".join("" if x is None else str(x) for x in v)
    return str(v)


def _valid_field(field: str) -> bool:
    if field in ("name", "description"):
        return True
    if field.startswith("attributes."):
        key = field[len("attributes."):]
        return bool(key.strip()) and key != "parent_id"
    return False


def current_value(node: NodeORM, field: str) -> str | None:
    if field == "name":
        return node.name
    if field == "description":
        return node.description
    return _as_text((node.attributes or {}).get(field[len("attributes."):]))


def _to_read(p: ChangeProposalORM, node: NodeORM) -> ChangeProposalRead:
    return ChangeProposalRead(
        id=p.id,
        node_id=p.node_id,
        node_name=node.name,
        node_type=node.type,
        node_source=node.external_source,
        field=p.field,
        old_value=p.old_value,
        new_value=p.new_value,
        current_value=current_value(node, p.field),
        comment=p.comment,
        proposed_by=p.proposed_by,
        proposed_by_id=p.proposed_by_id,
        status=p.status,
        created_at=p.created_at,
        resolved_by=p.resolved_by,
        resolved_at=p.resolved_at,
        resolution_note=p.resolution_note,
    )


def _snapshot(p: ChangeProposalORM) -> dict[str, Any]:
    return {
        "proposal_id": str(p.id),
        "field": p.field,
        "old_value": p.old_value,
        "new_value": p.new_value,
        "proposed_by": p.proposed_by,
        "comment": p.comment,
        "status": p.status,
    }


async def list_pending_proposals(repo: PostgresRepository) -> list[ChangeProposalRead]:
    """All pending proposals, oldest first – the admin inbox reads this too."""
    async with repo._session_factory() as s:
        rows = (
            await s.execute(
                select(ChangeProposalORM, NodeORM)
                .join(NodeORM, ChangeProposalORM.node_id == NodeORM.id)
                .where(ChangeProposalORM.status == "pending")
                .order_by(ChangeProposalORM.created_at.asc())
            )
        ).all()
    return [_to_read(p, n) for p, n in rows]


@node_router.get("/{node_id}/change-proposals", response_model=list[ChangeProposalRead])
async def list_node_proposals(
    node_id: UUID,
    user: CurrentUser = Depends(require_user),
) -> list[ChangeProposalRead]:
    """Pending proposals on one node – what the detail panel strikes through."""
    repo = _get_pg_repo()
    async with repo._session_factory() as s:
        node = await s.get(NodeORM, node_id)
        if node is None:
            raise HTTPException(status_code=404, detail="Node not found")
        await ensure_visible(user, node)
        rows = (
            await s.execute(
                select(ChangeProposalORM)
                .where(
                    ChangeProposalORM.node_id == node_id,
                    ChangeProposalORM.status == "pending",
                )
                .order_by(ChangeProposalORM.created_at.asc())
            )
        ).scalars().all()
        return [_to_read(p, node) for p in rows]


@node_router.post(
    "/{node_id}/change-proposals",
    response_model=list[ChangeProposalRead],
    status_code=status.HTTP_201_CREATED,
)
async def create_proposals(
    node_id: UUID,
    data: ChangeProposalCreate,
    user: CurrentUser = Depends(require_user),
) -> list[ChangeProposalRead]:
    """Any signed-in user, whatever their role, can propose a change."""
    repo = _get_pg_repo()
    comment = (data.comment or "").strip() or None
    async with repo._session_factory() as s:
        node = await s.get(NodeORM, node_id)
        if node is None:
            raise HTTPException(status_code=404, detail="Node not found")
        await ensure_visible(user, node)

        seen: set[str] = set()
        created: list[ChangeProposalORM] = []
        for change in data.changes:
            field = change.field.strip()
            if not _valid_field(field):
                raise HTTPException(status_code=422, detail=f"Okänt fält: {change.field}")
            if field in seen:
                raise HTTPException(status_code=422, detail=f"Fältet {field} förekommer två gånger")
            seen.add(field)
            new_value = change.new_value.strip()
            if field == "name" and not new_value:
                raise HTTPException(status_code=422, detail="Namnet kan inte föreslås tomt")
            old_value = current_value(node, field)
            if new_value == (old_value or "").strip():
                continue  # nothing would change – not a proposal
            p = ChangeProposalORM(
                node_id=node.id,
                field=field,
                old_value=old_value,
                new_value=new_value,
                comment=comment,
                proposed_by=_display_name(user),
                proposed_by_id=user.id,
                status="pending",
            )
            s.add(p)
            created.append(p)

        if not created:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Förslaget ändrar ingenting",
            )
        await s.flush()
        for p in created:
            await repo._audit(
                s, "PROPOSE", "node", node.id,
                entity_name=node.name, entity_subtype=node.type,
                snapshot_before={p.field: p.old_value},
                snapshot_after={p.field: p.new_value},
                user_name=p.proposed_by,
                change_note=comment,
            )
        await s.commit()
        for p in created:
            await s.refresh(p)
        return [_to_read(p, node) for p in created]


@router.get("", response_model=list[ChangeProposalRead])
async def list_proposals(
    status_filter: str = Query("pending", alias="status"),
    user: CurrentUser = Depends(require_editor),
) -> list[ChangeProposalRead]:
    repo = _get_pg_repo()
    policy = await load_policy(user)
    if status_filter == "pending":
        return [p for p in await list_pending_proposals(repo) if policy.can_see(p.node_id, p.node_type)]
    async with repo._session_factory() as s:
        q = (
            select(ChangeProposalORM, NodeORM)
            .join(NodeORM, ChangeProposalORM.node_id == NodeORM.id)
            .order_by(ChangeProposalORM.created_at.desc())
            .limit(500)
        )
        if status_filter != "all":
            q = q.where(ChangeProposalORM.status == status_filter)
        rows = (await s.execute(q)).all()
    return [_to_read(p, n) for p, n in rows if policy.can_see(n.id, n.type)]


@router.post("/{proposal_id}/resolve", response_model=ChangeProposalRead)
async def resolve_proposal(
    proposal_id: UUID,
    data: ChangeProposalResolve,
    user: CurrentUser = Depends(require_editor),
) -> ChangeProposalRead:
    """Admin marks the proposal handled – the strike-through disappears and
    the node shows what the underlying list delivers. The node is NOT written:
    the change is made in the list by hand and arrives with the sync."""
    repo = _get_pg_repo()
    async with repo._session_factory() as s:
        p = await s.get(ChangeProposalORM, proposal_id)
        if p is None:
            raise HTTPException(status_code=404, detail="Proposal not found")
        if p.status != "pending":
            raise HTTPException(status_code=409, detail="Förslaget är redan hanterat")
        node = await s.get(NodeORM, p.node_id)
        if node is None:
            raise HTTPException(status_code=404, detail="Objektet finns inte längre")
        await ensure_visible(user, node)
        before = _snapshot(p)
        p.status = data.outcome
        p.resolved_by = _display_name(user)
        p.resolved_at = datetime.now(timezone.utc)
        p.resolution_note = (data.note or "").strip() or None
        await repo._audit(
            s, "PROPOSE_DONE" if data.outcome == "done" else "PROPOSE_REJECT",
            "node", p.node_id,
            entity_name=node.name,
            entity_subtype=node.type,
            snapshot_before=before,
            snapshot_after={**_snapshot(p), "current_value": current_value(node, p.field)},
            user_name=p.resolved_by,
            change_note=p.resolution_note,
        )
        await s.commit()
        await s.refresh(p)
        return _to_read(p, node)


@router.delete("/{proposal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def withdraw_proposal(
    proposal_id: UUID,
    user: CurrentUser = Depends(require_user),
) -> Response:
    """The proposer (or an editor) withdraws a pending proposal. The row stays,
    marked withdrawn, and the withdrawal is logged."""
    repo = _get_pg_repo()
    async with repo._session_factory() as s:
        p = await s.get(ChangeProposalORM, proposal_id)
        if p is None:
            raise HTTPException(status_code=404, detail="Proposal not found")
        if p.status != "pending":
            raise HTTPException(status_code=409, detail="Förslaget är redan hanterat")
        if user.role not in EDITOR_ROLES and p.proposed_by_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bara den som lämnat förslaget kan dra tillbaka det",
            )
        node = await s.get(NodeORM, p.node_id)
        before = _snapshot(p)
        p.status = "withdrawn"
        p.resolved_by = _display_name(user)
        p.resolved_at = datetime.now(timezone.utc)
        await repo._audit(
            s, "PROPOSE_WITHDRAW", "node", p.node_id,
            entity_name=node.name if node else None,
            entity_subtype=node.type if node else None,
            snapshot_before=before,
            snapshot_after=_snapshot(p),
            user_name=p.resolved_by,
        )
        await s.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
