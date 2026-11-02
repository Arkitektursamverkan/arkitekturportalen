"""Node CRUD endpoints."""
from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel

from app.access import ensure_visible, filter_nodes, get_optional_user, load_policy
from app.auth import CurrentUser
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_admin, require_user
from app.domain_lists import LIST_KEY
from app.domain_lists import parse as parse_lists
from app.models.node_deletion_log import NodeDeletionLogORM
from app.schemas.common import NodeType
from app.schemas.node import NodeCreate, NodeRead, NodeUpdate
from app.services import org_settings

router = APIRouter(prefix="/nodes", tags=["nodes"])


@router.get("", response_model=list[NodeRead])
async def list_nodes(
    node_type: str | None = Query(None, description="Filter by node type"),
    external_source: str | None = Query(None),
    archived: bool = Query(False),
    limit: int = Query(1000, le=10000),
    offset: int = Query(0),
    user: CurrentUser | None = Depends(get_optional_user),
) -> list[NodeRead]:
    repo = get_repository()
    nodes = await repo.list_nodes(
        node_type=node_type,
        external_source=external_source,
        archived=archived,
        limit=limit,
        offset=offset,
    )
    return await filter_nodes(user, nodes)


def _who(user: CurrentUser) -> str:
    """The name the audit log keeps for a change."""
    return user.name or user.email


def _require_active_list(data: NodeCreate) -> None:
    """An object in an own list needs a list to be in."""
    if data.type != NodeType.CUSTOM_OBJECT:
        return
    key = (data.attributes or {}).get(LIST_KEY)
    if not any(c.key == key and c.active for c in parse_lists(org_settings.domain_lists()).custom):
        raise HTTPException(status_code=422, detail="Listan finns inte eller är avstängd")


@router.post("", response_model=NodeRead, status_code=status.HTTP_201_CREATED)
async def create_node(data: NodeCreate, user: CurrentUser = Depends(require_user)) -> NodeRead:
    parent_id = (data.attributes or {}).get("parent_id")
    (await load_policy(user)).require_create(data.type, parent_id)
    _require_active_list(data)
    repo = get_repository()
    return await repo.create_node(data, user_name=_who(user))


@router.get("/{node_id}", response_model=NodeRead)
async def get_node(node_id: UUID, user: CurrentUser | None = Depends(get_optional_user)) -> NodeRead:
    repo = get_repository()
    node = await repo.get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    await ensure_visible(user, node)
    return node


@router.patch("/{node_id}", response_model=NodeRead)
async def update_node(node_id: UUID, data: NodeUpdate, user: CurrentUser = Depends(require_user)) -> NodeRead:
    repo = get_repository()
    existing = await repo.get_node(node_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Node not found")
    policy = await load_policy(user)
    policy.require_edit(existing)
    # Moving a process elsewhere in the tree also needs the right to create
    # it there — otherwise a förvaltare could hang processes under a branch
    # someone else manages.
    if data.attributes is not None:
        new_parent = data.attributes.get("parent_id") or None
        if new_parent != (existing.attributes.get("parent_id") or None):
            policy.require_create(existing.type, new_parent)
    node = await repo.update_node(node_id, data, user_name=_who(user))
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return node


@router.delete("", dependencies=[Depends(require_admin)])
async def bulk_delete_nodes(
    node_type: str | None = Query(None, description="Filter by node type"),
    external_source: str | None = Query(None, description="Filter by external source"),
) -> dict:
    """Delete all nodes matching the given filters. Returns count of deleted nodes."""
    repo = get_repository()
    nodes = await repo.list_nodes(node_type=node_type, external_source=external_source, limit=10_000)
    count = 0
    for node in nodes:
        await repo.delete_node(node.id)
        count += 1
    return {"deleted": count}


class NodeDeleteRequest(BaseModel):
    reason: str


@router.delete("/{node_id}")
async def delete_node(
    node_id: UUID,
    data: NodeDeleteRequest,
    current_user: CurrentUser = Depends(require_user),
) -> Response:
    repo = get_repository()
    node = await repo.get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    (await load_policy(current_user)).require_edit(node)

    if isinstance(repo, PostgresRepository):
        async with repo._session_factory() as s:
            log = NodeDeletionLogORM(
                id=uuid4(),
                node_id=str(node_id),
                node_name=node.name,
                node_type=node.type,
                reason=data.reason.strip(),
                deleted_by=current_user.email or current_user.name,
                deleted_at=datetime.now(UTC),
            )
            s.add(log)
            await s.commit()

    deleted = await repo.delete_node(node_id, user_name=_who(current_user))
    if not deleted:
        raise HTTPException(status_code=404, detail="Node not found")
    return Response(status_code=204)
