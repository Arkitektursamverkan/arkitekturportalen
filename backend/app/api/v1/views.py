"""Graph view endpoints — return GraphData consumed by the frontend Cytoscape canvas."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.access import ensure_visible, get_optional_user, load_policy
from app.auth import CurrentUser
from app.dependencies import get_repository
from app.schemas.common import GraphData

router = APIRouter(prefix="/views", tags=["views"])


@router.get("/process/{process_id}", response_model=GraphData)
async def process_e2e(process_id: UUID, user: CurrentUser | None = Depends(get_optional_user)) -> GraphData:
    """End-to-end graph for a single Process node."""
    repo = get_repository()
    node = await repo.get_node(process_id)
    if not node:
        raise HTTPException(status_code=404, detail="Process not found")
    policy = await ensure_visible(user, node)
    return policy.filter_graph(await repo.get_process_e2e(process_id))


@router.get("/system/{app_id}", response_model=GraphData)
async def system_view(app_id: UUID, user: CurrentUser | None = Depends(get_optional_user)) -> GraphData:
    """System-centric graph for a single Application node."""
    repo = get_repository()
    node = await repo.get_node(app_id)
    if not node:
        raise HTTPException(status_code=404, detail="Application not found")
    policy = await ensure_visible(user, node)
    return policy.filter_graph(await repo.get_system_view(app_id))


@router.get("/landscape", response_model=GraphData)
async def landscape(user: CurrentUser | None = Depends(get_optional_user)) -> GraphData:
    """All Applications with INTEGRATES_WITH edges (system landscape)."""
    repo = get_repository()
    return (await load_policy(user)).filter_graph(await repo.get_landscape())


@router.get("/overlap-gaps", dependencies=[Depends(get_optional_user)])
async def overlap_gaps() -> dict:
    """Overlap and gap analysis across the EA data model."""
    repo = get_repository()
    overlaps = await repo.get_overlaps()
    gaps = await repo.get_gaps()
    return {"overlaps": overlaps, "gaps": gaps}
