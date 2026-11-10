"""Edge CRUD endpoints."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.access import filter_edges, get_optional_user, hidden_node_ids, load_policy
from app.auth import CurrentUser
from app.dependencies import get_repository, require_user
from app.schemas.edge import EdgeCreate, EdgeDirectionUpdate, EdgeRead, EdgeUpdate

router = APIRouter(prefix="/edges", tags=["edges"])


@router.get("", response_model=list[EdgeRead])
async def list_edges(
    source_id: UUID | None = Query(None),
    target_id: UUID | None = Query(None),
    edge_type: str | None = Query(None),
    user: CurrentUser | None = Depends(get_optional_user),
) -> list[EdgeRead]:
    repo = get_repository()
    edges = await repo.list_edges(source_id=source_id, target_id=target_id, edge_type=edge_type)
    return filter_edges(edges, await hidden_node_ids(user))


async def _visible_edge(edge_id: UUID, user: CurrentUser | None) -> EdgeRead:
    """The edge, or 404 when missing or touching a node the user may not see."""
    repo = get_repository()
    edge = await repo.get_edge(edge_id)
    if not edge or not filter_edges([edge], await hidden_node_ids(user)):
        raise HTTPException(status_code=404, detail="Edge not found")
    return edge


async def _require_write(user: CurrentUser, source_id: UUID | str, target_id: UUID | str) -> None:
    repo = get_repository()
    source = await repo.get_node(UUID(str(source_id)))
    target = await repo.get_node(UUID(str(target_id)))
    if not source or not target:
        raise HTTPException(status_code=404, detail="Node not found")
    (await load_policy(user)).require_edge_write(source, target)


@router.post("", response_model=EdgeRead, status_code=status.HTTP_201_CREATED)
async def create_edge(data: EdgeCreate, user: CurrentUser = Depends(require_user)) -> EdgeRead:
    await _require_write(user, data.source_id, data.target_id)
    repo = get_repository()
    return await repo.create_edge(data)


@router.get("/{edge_id}", response_model=EdgeRead)
async def get_edge(edge_id: UUID, user: CurrentUser | None = Depends(get_optional_user)) -> EdgeRead:
    return await _visible_edge(edge_id, user)


@router.patch("/{edge_id}/note", response_model=EdgeRead)
async def update_edge_note(
    edge_id: UUID,
    data: EdgeUpdate,
    user: CurrentUser = Depends(require_user),
) -> EdgeRead:
    # A note is a change to the edge like any other: same right as the rest.
    existing = await _visible_edge(edge_id, user)
    await _require_write(user, existing.source_id, existing.target_id)
    repo = get_repository()
    edge = await repo.update_edge_note(edge_id, data.note)
    if not edge:
        raise HTTPException(status_code=404, detail="Edge not found")
    return edge


@router.patch("/{edge_id}/direction", response_model=EdgeRead)
async def update_edge_direction(
    edge_id: UUID, data: EdgeDirectionUpdate, user: CurrentUser = Depends(require_user),
) -> EdgeRead:
    """Set which way an integration flows: →, ↔ or ←."""
    existing = await _visible_edge(edge_id, user)
    await _require_write(user, existing.source_id, existing.target_id)
    repo = get_repository()
    edge = await repo.update_edge_direction(edge_id, data.direction)
    if not edge:
        raise HTTPException(status_code=404, detail="Edge not found")
    return edge


@router.delete("/{edge_id}")
async def delete_edge(edge_id: UUID, user: CurrentUser = Depends(require_user)) -> Response:
    existing = await _visible_edge(edge_id, user)
    await _require_write(user, existing.source_id, existing.target_id)
    repo = get_repository()
    deleted = await repo.delete_edge(edge_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Edge not found")
    return Response(status_code=204)
