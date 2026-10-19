"""Architecture principle CRUD endpoints.

Stored as Nodes of type ArchitecturePrinciple; this module provides a typed
facade so the frontend doesn't have to know about the underlying graph model.
Access follows the grants (app/access.py) exactly as /nodes does, so a
principle hidden there is hidden here too.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.access import ensure_visible, filter_nodes, get_optional_user, load_policy
from app.auth import CurrentUser
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_user
from app.schemas.common import NodeType, PrincipleDomain, PrincipleStatus
from app.schemas.node import NodeCreate, NodeUpdate
from app.schemas.principle import PrincipleCreate, PrincipleRead, PrincipleUpdate

router = APIRouter(prefix="/principles", tags=["principles"])


def _to_attributes(p: PrincipleCreate) -> dict[str, str]:
    return {
        "identifier": p.identifier,
        "domain": p.domain.value,
        "purpose": p.purpose,
        "not": p.not_,
        "but": p.but,
        "means": p.means,
        "status": p.status.value,
    }


@router.get("", response_model=list[PrincipleRead])
async def list_principles(
    status_filter: PrincipleStatus | None = Query(None, alias="status"),
    domain: PrincipleDomain | None = Query(None),
    user: CurrentUser | None = Depends(get_optional_user),
) -> list[PrincipleRead]:
    repo = get_repository()
    nodes = await filter_nodes(user, await repo.list_nodes(node_type=NodeType.ARCHITECTURE_PRINCIPLE.value, limit=10000))
    principles = [PrincipleRead.from_node(n) for n in nodes]
    if status_filter is not None:
        principles = [p for p in principles if p.status == status_filter]
    if domain is not None:
        principles = [p for p in principles if p.domain == domain]
    principles.sort(key=lambda p: p.identifier)
    return principles


@router.post(
    "",
    response_model=PrincipleRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_principle(data: PrincipleCreate, user: CurrentUser = Depends(require_user)) -> PrincipleRead:
    (await load_policy(user)).require_create(NodeType.ARCHITECTURE_PRINCIPLE)
    repo = get_repository()
    node = await repo.create_node(
        NodeCreate(
            type=NodeType.ARCHITECTURE_PRINCIPLE,
            name=data.name,
            attributes=_to_attributes(data),
        )
    )
    if isinstance(repo, PostgresRepository):
        await repo.touch_principle_document()
    return PrincipleRead.from_node(node)


@router.get("/{principle_id}", response_model=PrincipleRead)
async def get_principle(principle_id: UUID, user: CurrentUser | None = Depends(get_optional_user)) -> PrincipleRead:
    repo = get_repository()
    node = await repo.get_node(principle_id)
    if not node or node.type != NodeType.ARCHITECTURE_PRINCIPLE:
        raise HTTPException(status_code=404, detail="Principle not found")
    await ensure_visible(user, node)
    return PrincipleRead.from_node(node)


@router.patch("/{principle_id}", response_model=PrincipleRead)
async def update_principle(
    principle_id: UUID, data: PrincipleUpdate, user: CurrentUser = Depends(require_user),
) -> PrincipleRead:
    repo = get_repository()
    existing = await repo.get_node(principle_id)
    if not existing or existing.type != NodeType.ARCHITECTURE_PRINCIPLE:
        raise HTTPException(status_code=404, detail="Principle not found")
    (await load_policy(user)).require_edit(existing)

    new_attrs = dict(existing.attributes or {})
    if data.identifier is not None:
        new_attrs["identifier"] = data.identifier
    if data.domain is not None:
        new_attrs["domain"] = data.domain.value
    if data.purpose is not None:
        new_attrs["purpose"] = data.purpose
    if data.not_ is not None:
        new_attrs["not"] = data.not_
    if data.but is not None:
        new_attrs["but"] = data.but
    if data.means is not None:
        new_attrs["means"] = data.means
    if data.status is not None:
        new_attrs["status"] = data.status.value

    update = NodeUpdate(
        name=data.name if data.name is not None else None,
        attributes=new_attrs,
    )
    updated = await repo.update_node(principle_id, update)
    if not updated:
        raise HTTPException(status_code=404, detail="Principle not found")
    if isinstance(repo, PostgresRepository):
        await repo.touch_principle_document()
    return PrincipleRead.from_node(updated)


@router.delete("/{principle_id}")
async def delete_principle(principle_id: UUID, user: CurrentUser = Depends(require_user)) -> Response:
    repo = get_repository()
    existing = await repo.get_node(principle_id)
    if not existing or existing.type != NodeType.ARCHITECTURE_PRINCIPLE:
        raise HTTPException(status_code=404, detail="Principle not found")
    (await load_policy(user)).require_edit(existing)
    await repo.delete_node(principle_id)
    if isinstance(repo, PostgresRepository):
        await repo.touch_principle_document()
    return Response(status_code=204)
