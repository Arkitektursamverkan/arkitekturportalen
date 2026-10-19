"""CRUD endpoints for Lösningsskiss intake forms."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.auth import CurrentUser
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_editor, require_user
from app.schemas.solution_sketch import (
    SketchCreate,
    SketchRead,
    SketchSummary,
    SketchUpdate,
    SketchStatus,
)

router = APIRouter(prefix="/solution-sketches", tags=["solution-sketches"])


def _get_pg_repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Lösningsskiss requires PostgreSQL backend",
        )
    return repo


def _row_to_read(r) -> SketchRead:  # type: ignore[no-untyped-def]
    return SketchRead.model_validate(r)


@router.get("", response_model=list[SketchSummary])
async def list_sketches(
    status_filter: SketchStatus | None = Query(None, alias="status"),
    _user: CurrentUser = Depends(require_user),
) -> list[SketchSummary]:
    repo = _get_pg_repo()
    rows = await repo.list_solution_sketches(status=status_filter)
    return [SketchSummary.model_validate(r) for r in rows]


@router.post("", response_model=SketchRead, status_code=status.HTTP_201_CREATED)
async def create_sketch(
    data: SketchCreate,
    user: CurrentUser = Depends(require_user),
) -> SketchRead:
    repo = _get_pg_repo()
    row = await repo.create_solution_sketch(
        title=data.title,
        description=data.description,
        created_by=user.email or user.name or None,
    )
    return _row_to_read(row)


@router.get("/{sketch_id}", response_model=SketchRead)
async def get_sketch(
    sketch_id: UUID,
    _user: CurrentUser = Depends(require_user),
) -> SketchRead:
    repo = _get_pg_repo()
    row = await repo.get_solution_sketch(sketch_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Sketch not found")
    return _row_to_read(row)


@router.patch("/{sketch_id}", response_model=SketchRead)
async def update_sketch(
    sketch_id: UUID,
    data: SketchUpdate,
    user: CurrentUser = Depends(require_user),
) -> SketchRead:
    repo = _get_pg_repo()
    # Approving / archiving requires admin; everyone else can edit drafts
    if data.status in ("approved", "archived") and user.role not in ("admin", "system"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Endast admin kan godkänna eller arkivera",
        )
    row = await repo.update_solution_sketch(
        sketch_id,
        title=data.title,
        description=data.description,
        status=data.status,
        answers=data.answers,
        updated_by=user.email or user.name or None,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Sketch not found")
    return _row_to_read(row)


@router.delete("/{sketch_id}")
async def delete_sketch(
    sketch_id: UUID,
    _admin: CurrentUser = Depends(require_editor),
) -> Response:
    repo = _get_pg_repo()
    if not await repo.delete_solution_sketch(sketch_id):
        raise HTTPException(status_code=404, detail="Sketch not found")
    return Response(status_code=204)
