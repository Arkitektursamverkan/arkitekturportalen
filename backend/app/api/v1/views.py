"""Graph view endpoints — return GraphData consumed by the frontend Cytoscape canvas."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.access import Policy, ensure_visible, get_optional_user, load_policy
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


@router.get("/overlap-gaps")
async def overlap_gaps(user: CurrentUser | None = Depends(get_optional_user)) -> dict:
    """Overlap and gap analysis across the EA data model.

    Filtered like every other view: an object the user may not see is not
    listed, nor named among an overlap's applications – and an overlap that
    is one only through applications the user may not see is not shown."""
    repo = get_repository()
    policy = await load_policy(user)
    overlaps = await repo.get_overlaps()
    gaps = await repo.get_gaps()
    return {
        "overlaps": {
            "overlapping_processes": _visible_overlaps(policy, overlaps.get("overlapping_processes", []), "Process"),
            "overlapping_info_objects": _visible_overlaps(
                policy, overlaps.get("overlapping_info_objects", []), "InformationObject",
            ),
        },
        "gaps": {
            "unsupported_processes": _visible_rows(policy, gaps.get("unsupported_processes", []), "Process"),
            "unrealized_info_objects": _visible_rows(policy, gaps.get("unrealized_info_objects", []), "InformationObject"),
            "orphaned_applications": _visible_rows(policy, gaps.get("orphaned_applications", []), "Application"),
        },
    }


def _visible_rows(policy: Policy, rows: list[dict], node_type: str) -> list[dict]:
    return [r for r in rows if policy.can_see(r["id"], node_type)]


def _visible_overlaps(policy: Policy, rows: list[dict], node_type: str) -> list[dict]:
    out = []
    for r in _visible_rows(policy, rows, node_type):
        # The repository hands over the applications' ids beside their names
        # for this check; the response keeps the shape it always had.
        apps = [
            name for app_id, name in zip(r.get("app_ids") or [], r.get("app_names") or [], strict=False)
            if policy.can_see(app_id, "Application")
        ]
        if len(apps) < 2:
            continue
        row = {k: v for k, v in r.items() if k != "app_ids"}
        out.append({**row, "app_names": apps, "app_count": len(apps)})
    return out
