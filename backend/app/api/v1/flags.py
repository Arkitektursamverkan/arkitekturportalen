"""Quality flags on EA nodes — any user can flag, admin can remove any flag."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.access import ensure_visible, hidden_node_ids
from app.auth import CurrentUser
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_editor, require_user
from app.schemas.flag import NodeFlagCreate, NodeFlagRead, NodeFlagRespond

router = APIRouter(prefix="/nodes", tags=["flags"])
all_flags_router = APIRouter(prefix="/flags", tags=["flags"])


def _get_pg_repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Flags require PostgreSQL backend",
        )
    return repo


async def _ensure_visible(node_id: UUID, user: CurrentUser) -> None:
    node = await get_repository().get_node(node_id)
    if node is not None:
        await ensure_visible(user, node)


def _identity(u: CurrentUser) -> str | None:
    return u.email or u.name or None


@router.get("/{node_id}/flags", response_model=list[NodeFlagRead])
async def list_flags(
    node_id: UUID,
    user: CurrentUser = Depends(require_user),
) -> list[NodeFlagRead]:
    repo = _get_pg_repo()
    await _ensure_visible(node_id, user)
    rows = await repo.list_node_flags(node_id)
    return [NodeFlagRead.model_validate(r) for r in rows]


@router.post("/{node_id}/flags", response_model=NodeFlagRead, status_code=status.HTTP_201_CREATED)
async def create_flag(
    node_id: UUID,
    data: NodeFlagCreate,
    user: CurrentUser = Depends(require_user),
) -> NodeFlagRead:
    repo = _get_pg_repo()
    await _ensure_visible(node_id, user)
    row = await repo.create_node_flag(
        node_id=node_id,
        flag_type=data.flag_type.value,
        description=data.description,
        created_by=_identity(user),
    )
    return NodeFlagRead.model_validate(row)


@router.delete("/{node_id}/flags/{flag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_flag(
    node_id: UUID,
    flag_id: UUID,
    user: CurrentUser = Depends(require_user),
) -> Response:
    repo = _get_pg_repo()
    rows = await repo.list_node_flags(node_id)
    flag = next((r for r in rows if r.id == flag_id), None)
    if flag is None:
        raise HTTPException(status_code=404, detail="Flag not found")

    is_admin = user.role in ("admin", "system")
    if not is_admin and flag.created_by != _identity(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Endast administratörer eller flaggans skapare kan ta bort den",
        )
    await repo.delete_node_flag(flag_id)
    return Response(status_code=204)


@router.patch("/{node_id}/flags/{flag_id}/response", response_model=NodeFlagRead)
async def respond_to_flag(
    node_id: UUID,
    flag_id: UUID,
    data: NodeFlagRespond,
    user: CurrentUser = Depends(require_editor),
) -> NodeFlagRead:
    repo = _get_pg_repo()
    row = await repo.respond_to_flag(flag_id=flag_id, response=data.response, responded_by=_identity(user))
    if row is None:
        raise HTTPException(status_code=404, detail="Flag not found")
    return NodeFlagRead.model_validate(row)


@all_flags_router.get("", response_model=list[NodeFlagRead])
async def list_all_flags(
    user: CurrentUser = Depends(require_user),
) -> list[NodeFlagRead]:
    """Return all quality flags across all nodes, newest first."""
    repo = _get_pg_repo()
    rows = await repo.list_all_node_flags()
    hidden = await hidden_node_ids(user)
    return [NodeFlagRead.model_validate(r) for r in rows if str(r.node_id) not in hidden]
