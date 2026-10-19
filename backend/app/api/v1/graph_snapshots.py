"""Endpoints for graph state snapshots."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.access import Policy, load_policy
from app.auth import CurrentUser
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_admin, require_editor
from app.schemas.graph_snapshot import GraphSnapshotCreate, GraphSnapshotListItem
from app.services.graph_version import take_graph_snapshot

router = APIRouter(prefix="/graph", tags=["graph-snapshots"])


def _visible(item: GraphSnapshotListItem, policy: Policy) -> GraphSnapshotListItem:
    """Leave out history entries about nodes the user may not see."""
    entries = [
        a for a in item.audit_entries
        if a.get("entity_type") != "node" or policy.can_see(a.get("entity_id"), a.get("entity_subtype") or "")
    ]
    return item.model_copy(update={"audit_entries": entries})


def _get_pg_repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Graph snapshots require PostgreSQL backend",
        )
    return repo


@router.get("/snapshots", response_model=list[GraphSnapshotListItem])
async def list_graph_snapshots(
    editor: CurrentUser = Depends(require_editor),
) -> list[GraphSnapshotListItem]:
    """List all graph snapshots, newest first."""
    repo = _get_pg_repo()
    rows = await repo.list_graph_snapshots()
    policy = await load_policy(editor)
    return [_visible(GraphSnapshotListItem.model_validate(r), policy) for r in rows]


@router.post(
    "/snapshots",
    response_model=GraphSnapshotListItem,
    status_code=status.HTTP_201_CREATED,
)
async def create_graph_snapshot(
    body: GraphSnapshotCreate,
    admin: CurrentUser = Depends(require_admin),
) -> GraphSnapshotListItem:
    """Manually create a new graph snapshot."""
    repo = _get_pg_repo()
    await take_graph_snapshot(
        repo,
        created_by=admin.name or admin.email or "",
        triggered_by="manual",
        label=body.label or None,
    )
    row = await repo.get_latest_graph_snapshot()
    if row is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)
    return GraphSnapshotListItem.model_validate(row)


@router.get("/snapshots/{snapshot_id}", response_model=GraphSnapshotListItem)
async def get_graph_snapshot(
    snapshot_id: UUID,
    editor: CurrentUser = Depends(require_editor),
) -> GraphSnapshotListItem:
    """Return metadata and audit entries for a specific graph snapshot."""
    repo = _get_pg_repo()
    row = await repo.get_graph_snapshot(snapshot_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return _visible(GraphSnapshotListItem.model_validate(row), await load_policy(editor))
