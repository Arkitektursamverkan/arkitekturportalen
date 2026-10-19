"""Full-text search endpoint."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app import modules
from app.access import filter_nodes, get_optional_user
from app.auth import CurrentUser
from app.dependencies import get_repository
from app.schemas.common import NodeType
from app.schemas.node import NodeRead

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=list[NodeRead])
async def search(
    q: str = Query(..., min_length=1, description="Search term"),
    limit: int = Query(20, le=100),
    user: CurrentUser | None = Depends(get_optional_user),
) -> list[NodeRead]:
    """Search nodes by name or description (case-insensitive). Principles
    belong to Arkitekturstyrning and are left out while it is off."""
    repo = get_repository()
    nodes = await repo.search_nodes(q, limit=limit)
    if not modules.enabled("governance"):
        nodes = [n for n in nodes if n.type != NodeType.ARCHITECTURE_PRINCIPLE]
    return await filter_nodes(user, nodes)
