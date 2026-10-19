"""CRUD endpoints for GAP-analys tasks."""
from __future__ import annotations

from collections import defaultdict
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth import CurrentUser
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_editor, require_user
from app.schemas.gap_task import (
    GapStatusLogCreate, GapStatusLogRead,
    GapTaskCreate, GapTaskItemSummary, GapTaskRead,
    GapTaskSummaryResponse, GapTaskUpdate,
)

router = APIRouter(prefix="/gap-tasks", tags=["gap-tasks"])


def _pg_repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Requires PostgreSQL")
    return repo


@router.get("", response_model=list[GapTaskRead])
async def list_gap_tasks(
    gap_item_id: str | None = Query(default=None),
    _user: CurrentUser = Depends(require_user),
) -> list[GapTaskRead]:
    repo = _pg_repo()
    tasks = await repo.list_gap_tasks(gap_item_id=gap_item_id)
    return [GapTaskRead.model_validate(t) for t in tasks]


@router.get("/summary", response_model=GapTaskSummaryResponse)
async def gap_tasks_summary(
    _user: CurrentUser = Depends(require_user),
) -> GapTaskSummaryResponse:
    repo = _pg_repo()
    tasks = await repo.list_all_gap_tasks()

    by_item: dict[str, dict] = defaultdict(
        lambda: {
            "total": 0, "todo": 0, "in_progress": 0, "done": 0, "cancelled": 0,
            "weight_active": 0, "weight_done": 0, "weight_in_progress": 0,
            "last_activity": None,
        }
    )
    for task in tasks:
        d = by_item[task.gap_item_id]
        d["total"] += 1
        if task.status in d:
            d[task.status] += 1
        if task.status != "cancelled":
            d["weight_active"] += task.weight
        if task.status in ("done", "in_progress"):
            d[f"weight_{task.status}"] += task.weight
        ts = task.completed_at or task.updated_at
        if d["last_activity"] is None or ts > d["last_activity"]:
            d["last_activity"] = ts

    return GapTaskSummaryResponse(
        by_item={k: GapTaskItemSummary(**v) for k, v in by_item.items()}
    )


@router.get("/status-log", response_model=list[GapStatusLogRead])
async def list_gap_status_log(
    gap_item_id: str = Query(...),
    _user: CurrentUser = Depends(require_user),
) -> list[GapStatusLogRead]:
    """Status changes on a GAP item and its tasks, newest first."""
    repo = _pg_repo()
    rows = await repo.list_gap_status_log(gap_item_id)
    return [GapStatusLogRead.model_validate(r) for r in rows]


@router.post("/status-log", response_model=GapStatusLogRead, status_code=status.HTTP_201_CREATED)
async def create_gap_status_log(
    data: GapStatusLogCreate,
    admin: CurrentUser = Depends(require_editor),
) -> GapStatusLogRead:
    repo = _pg_repo()
    row = await repo.create_gap_status_log(
        gap_item_id=data.gap_item_id,
        from_status=data.from_status,
        to_status=data.to_status,
        comment=data.comment.strip(),
        created_by=admin.name or admin.email or None,
    )
    return GapStatusLogRead.model_validate(row)


@router.post("", response_model=GapTaskRead, status_code=status.HTTP_201_CREATED)
async def create_gap_task(
    data: GapTaskCreate,
    admin: CurrentUser = Depends(require_editor),
) -> GapTaskRead:
    repo = _pg_repo()
    task = await repo.create_gap_task(
        gap_item_id=data.gap_item_id,
        title=data.title,
        description=data.description,
        assigned_to=data.assigned_to,
        due_date=data.due_date,
        horizon=data.horizon,
        weight=data.weight,
        created_by=admin.email or admin.name or None,
    )
    return GapTaskRead.model_validate(task)


@router.patch("/{task_id}", response_model=GapTaskRead)
async def update_gap_task(
    task_id: UUID,
    data: GapTaskUpdate,
    admin: CurrentUser = Depends(require_editor),
) -> GapTaskRead:
    repo = _pg_repo()
    updates = data.model_dump(exclude_none=True)
    status_comment = (updates.pop("status_comment", None) or "").strip()
    task = await repo.update_gap_task(
        task_id=task_id,
        updates=updates,
        status_comment=status_comment,
        updated_by=admin.name or admin.email or None,
    )
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return GapTaskRead.model_validate(task)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_gap_task(
    task_id: UUID,
    _admin: CurrentUser = Depends(require_editor),
) -> None:
    repo = _pg_repo()
    deleted = await repo.delete_gap_task(task_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
