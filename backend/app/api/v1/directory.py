"""Departments and people from Entra ID – the list other features pick from.

The copy is refreshed when an admin asks for it, with that admin's own Graph
token. Until the first sync
has run (or when the connection is not configured) the department list holds
only the names people have typed on calendar events. The applications'
Avdelning/enhet is deliberately not a source: it comes from the SharePoint
list and still carries departments that no longer exist.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.auth import CurrentUser
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_admin, require_user
from app.models.calendar_event import CalendarEventORM
from app.models.directory import DirectoryHiddenDepartmentORM, DirectoryPersonORM
from app.services.entra_directory import (
    DirectoryError,
    department_counts,
    is_configured,
    sync_directory,
)

router = APIRouter(prefix="/directory", tags=["directory"])

class Department(BaseModel):
    name: str
    # People in the department; null when the name does not come from Entra ID.
    people: int | None = None


class AdminDepartment(BaseModel):
    name: str
    people: int
    # Hidden departments are left out of the lists people pick from.
    hidden: bool


class DepartmentVisibility(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    hidden: bool


class DepartmentList(BaseModel):
    # entra = the directory copy; register = names typed on calendar events.
    source: Literal["entra", "register"]
    departments: list[Department]


class DirectorySync(BaseModel):
    # The signed-in admin's Microsoft Graph access token (User.Read.All).
    graph_token: str = Field(..., min_length=20, max_length=20000)


class DirectoryStatus(BaseModel):
    configured: bool
    people: int
    departments: int
    without_department: int
    last_synced_at: datetime | None


def _get_pg_repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="The directory requires PostgreSQL backend",
        )
    return repo


async def _register_departments(repo: PostgresRepository) -> list[str]:
    names: set[str] = set()
    async with repo._session_factory() as s:
        for used in (await s.execute(select(CalendarEventORM.departments))).scalars():
            names.update(used or [])
    return sorted(names, key=str.casefold)


async def _hidden(repo: PostgresRepository) -> set[str]:
    async with repo._session_factory() as s:
        return set((await s.execute(select(DirectoryHiddenDepartmentORM.name))).scalars())


async def _status(repo: PostgresRepository) -> DirectoryStatus:
    async with repo._session_factory() as s:
        people, with_department, departments, last = (
            await s.execute(
                select(
                    func.count(),
                    func.count(DirectoryPersonORM.department),
                    func.count(func.distinct(DirectoryPersonORM.department)),
                    func.max(DirectoryPersonORM.synced_at),
                )
            )
        ).one()
    return DirectoryStatus(
        configured=is_configured(),
        people=people,
        departments=departments,
        without_department=people - with_department,
        last_synced_at=last,
    )


@router.get("/departments", response_model=DepartmentList)
async def list_departments(_user: CurrentUser = Depends(require_user)) -> DepartmentList:
    repo = _get_pg_repo()
    counts = await department_counts(repo)
    if counts:
        hidden = await _hidden(repo)
        return DepartmentList(
            source="entra",
            departments=[Department(name=n, people=c) for n, c in counts if n not in hidden],
        )
    return DepartmentList(
        source="register",
        departments=[Department(name=n) for n in await _register_departments(repo)],
    )


@router.get("/departments/all", response_model=list[AdminDepartment])
async def list_all_departments(_admin: CurrentUser = Depends(require_admin)) -> list[AdminDepartment]:
    """Every department in the directory copy, hidden ones included."""
    repo = _get_pg_repo()
    hidden = await _hidden(repo)
    return [
        AdminDepartment(name=n, people=c, hidden=n in hidden)
        for n, c in await department_counts(repo)
    ]


@router.put("/departments/visibility", response_model=list[AdminDepartment])
async def set_department_visibility(
    data: DepartmentVisibility,
    _admin: CurrentUser = Depends(require_admin),
) -> list[AdminDepartment]:
    """Hide a department from the pick lists, or show it again. Events that
    already name the department keep it."""
    repo = _get_pg_repo()
    async with repo._session_factory() as s:
        row = await s.get(DirectoryHiddenDepartmentORM, data.name)
        if data.hidden and row is None:
            s.add(DirectoryHiddenDepartmentORM(name=data.name))
        elif not data.hidden and row is not None:
            await s.delete(row)
        await s.commit()
    return await list_all_departments(_admin)


@router.get("/status", response_model=DirectoryStatus)
async def directory_status(_admin: CurrentUser = Depends(require_admin)) -> DirectoryStatus:
    return await _status(_get_pg_repo())


@router.post("/sync", response_model=DirectoryStatus)
async def sync_now(data: DirectorySync, _admin: CurrentUser = Depends(require_admin)) -> DirectoryStatus:
    repo = _get_pg_repo()
    try:
        await sync_directory(repo, data.graph_token)
    except DirectoryError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))
    return await _status(repo)
