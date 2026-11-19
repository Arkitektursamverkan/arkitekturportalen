"""An installation's own reports — content supplied as data, not code.

The built-in reports compute something from the graph and are the same
everywhere. This is for the report only one installation needs: the outcome of
a one-off review, loaded as rows and shown by a generic report kind.

    PUT    /custom-reports/{key}                      load (or reload) a report
    GET    /custom-reports                            the reports the user may see
    GET    /custom-reports/{key}                      one report, rows included
    POST   /custom-reports/{key}/beslut               decide on rows
    DELETE /custom-reports/{key}                      remove a report

A report is for administrators only unless it says otherwise (`admin_only`).
Loading, deciding and removing always need an administrator — the API key
counts as one, so an installation can load its report from a script.

Report kinds
------------
`kopplingsforslag` — suggested connections. Each row names two objects and a
connection type, with a motivation. Nothing is connected by loading the
report: an administrator decides per row, **Koppla** (the connection is
created, exactly as if drawn by hand) or **Avstå**. A row whose connection
already exists says so, and reloading the report keeps the decisions made.
"""
from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.access import hidden_node_ids
from app.auth import CurrentUser
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_admin, require_user
from app.models.custom_report import CustomReportORM
from app.schemas.common import EdgeType
from app.schemas.edge import EdgeCreate

router = APIRouter(prefix="/custom-reports", tags=["custom-reports"])

_KEY = re.compile(r"^[a-z0-9][a-z0-9-]{0,79}$")
KINDS = ("kopplingsforslag",)
MAX_ROWS = 5000


class ProposalRow(BaseModel):
    """One suggested connection."""

    id: str = Field(..., min_length=1, max_length=120)
    source_id: UUID
    target_id: UUID
    edge_type: EdgeType
    # What the suggestion belongs to — the report groups and filters on it.
    grupp: str = Field("", max_length=120)
    # How sure the suggestion is: "hög" | "medel" | "låg" (free text is allowed).
    säkerhet: str = Field("", max_length=30)
    # Why it is suggested — what the reader needs to decide.
    motivering: str = Field("", max_length=2000)


class ReportLoad(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field("", max_length=5000)
    kind: Literal["kopplingsforslag"] = "kopplingsforslag"
    admin_only: bool = True
    rows: list[ProposalRow] = Field(default_factory=list, max_length=MAX_ROWS)


class Decision(BaseModel):
    row_ids: list[str] = Field(..., min_length=1, max_length=MAX_ROWS)
    # "koppla" creates the connection, "avstå" declines, null takes the
    # decision back (a connection already created stays).
    val: Literal["koppla", "avstå"] | None


def _repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "Custom reports require PostgreSQL backend")
    return repo


def _is_admin(user: CurrentUser) -> bool:
    return user.role in ("admin", "system")


def _identity(u: CurrentUser) -> str | None:
    return u.email or u.name or None


def _check_key(key: str) -> None:
    if not _KEY.fullmatch(key):
        raise HTTPException(404, "No such report")


def _meta(r: CustomReportORM) -> dict[str, Any]:
    rows = r.rows or []
    return {
        "key": r.key,
        "title": r.title,
        "description": r.description,
        "kind": r.kind,
        "admin_only": r.admin_only,
        "antal": len(rows),
        "obeslutade": sum(1 for x in rows if not x.get("beslut")),
        "updated_at": r.updated_at,
        "updated_by": r.updated_by,
    }


async def _get(key: str, user: CurrentUser) -> CustomReportORM:
    _check_key(key)
    async with _repo()._session_factory() as s:
        r = await s.get(CustomReportORM, key)
    # A report the user may not see does not exist, as far as they can tell.
    if r is None or (r.admin_only and not _is_admin(user)):
        raise HTTPException(404, "No such report")
    return r


async def _enriched(r: CustomReportORM, user: CurrentUser) -> dict[str, Any]:
    """The report with what a row needs to be read: the objects' current
    names and types, and whether the suggested connection exists by now."""
    repo = _repo()
    nodes = {str(n.id): n for n in await repo.list_nodes(limit=100_000)}
    finns = {(str(e.source_id), str(e.target_id), e.type.value) for e in await repo.list_edges()}
    hidden = await hidden_node_ids(user)

    def objekt(node_id: str) -> dict[str, Any] | None:
        n = nodes.get(node_id)
        return None if n is None else {"id": node_id, "name": n.name, "type": n.type.value}

    rows = []
    for x in r.rows or []:
        if x["source_id"] in hidden or x["target_id"] in hidden:
            continue
        rows.append({
            **x,
            "source": objekt(x["source_id"]),
            "target": objekt(x["target_id"]),
            "finns": (x["source_id"], x["target_id"], x["edge_type"]) in finns,
        })
    return {**_meta(r), "rows": rows}


@router.get("")
async def list_reports(user: CurrentUser = Depends(require_user)) -> dict[str, Any]:
    async with _repo()._session_factory() as s:
        alla = (await s.execute(select(CustomReportORM).order_by(CustomReportORM.title))).scalars().all()
    return {"reports": [_meta(r) for r in alla if _is_admin(user) or not r.admin_only]}


@router.get("/{key}")
async def get_report(key: str, user: CurrentUser = Depends(require_user)) -> dict[str, Any]:
    return await _enriched(await _get(key, user), user)


@router.put("/{key}")
async def load_report(key: str, data: ReportLoad, user: CurrentUser = Depends(require_admin)) -> dict[str, Any]:
    """Load a report, or replace one. Decisions already made are kept for the
    rows that are still there (same `id`); rows that are gone take their
    decisions with them."""
    if not _KEY.fullmatch(key):
        raise HTTPException(422, "The key may hold a–z, 0–9 and hyphens, at most 80 characters")
    ids = [x.id for x in data.rows]
    if len(set(ids)) != len(ids):
        raise HTTPException(422, "Row ids must be unique within the report")

    async with _repo()._session_factory() as s:
        r = await s.get(CustomReportORM, key, with_for_update=True)
        beslut = {x["id"]: x["beslut"] for x in (r.rows if r else []) if x.get("beslut")}
        rows = [
            {**x.model_dump(mode="json"), **({"beslut": beslut[x.id]} if x.id in beslut else {})}
            for x in data.rows
        ]
        if r is None:
            r = CustomReportORM(key=key)
            s.add(r)
        r.title = data.title
        r.description = data.description
        r.kind = data.kind
        r.admin_only = data.admin_only
        r.rows = rows
        r.updated_by = _identity(user)
        await s.commit()
        await s.refresh(r)
        return _meta(r)


@router.post("/{key}/beslut")
async def decide(key: str, data: Decision, user: CurrentUser = Depends(require_admin)) -> dict[str, Any]:
    """Decide on one or more rows.

    "koppla" creates the connection unless it already exists. A row whose
    objects are gone cannot be connected and is reported back in `fel`,
    untouched; the others go through.
    """
    _check_key(key)
    repo = _repo()
    önskade = set(data.row_ids)
    async with repo._session_factory() as s:
        r = await s.get(CustomReportORM, key)
    if r is None:
        raise HTTPException(404, "No such report")
    berörda = [x for x in (r.rows or []) if x["id"] in önskade]
    if len(berörda) != len(önskade):
        raise HTTPException(404, "No such row")

    skapade: dict[str, str] = {}
    fel: list[dict[str, str]] = []
    if data.val == "koppla":
        finns = {(str(e.source_id), str(e.target_id), e.type.value) for e in await repo.list_edges()}
        for x in berörda:
            nyckel = (x["source_id"], x["target_id"], x["edge_type"])
            if nyckel in finns:
                continue
            if await repo.get_node(UUID(x["source_id"])) is None or await repo.get_node(UUID(x["target_id"])) is None:
                fel.append({"id": x["id"], "fel": "Ett av objekten finns inte längre"})
                continue
            kant = await repo.create_edge(
                EdgeCreate(source_id=UUID(x["source_id"]), target_id=UUID(x["target_id"]), type=EdgeType(x["edge_type"]))
            )
            skapade[x["id"]] = str(kant.id)
            finns.add(nyckel)

    misslyckade = {f["id"] for f in fel}
    stämpel = {"av": _identity(user), "när": datetime.now(UTC).isoformat()}
    async with repo._session_factory() as s:
        # Read again under a lock: two administrators may be deciding at once.
        r = await s.get(CustomReportORM, key, with_for_update=True)
        if r is None:
            raise HTTPException(404, "No such report")
        nya = []
        for x in r.rows or []:
            if x["id"] in önskade and x["id"] not in misslyckade:
                x = {k: v for k, v in x.items() if k != "beslut"}
                if data.val is not None:
                    x["beslut"] = {
                        "val": data.val,
                        **stämpel,
                        **({"edge_id": skapade[x["id"]]} if x["id"] in skapade else {}),
                    }
            nya.append(x)
        r.rows = nya
        await s.commit()
        await s.refresh(r)
    return {**await _enriched(r, user), "skapade": len(skapade), "fel": fel}


@router.delete("/{key}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report(key: str, _user: CurrentUser = Depends(require_admin)) -> Response:
    """Remove a report. Connections made from it stay."""
    _check_key(key)
    async with _repo()._session_factory() as s:
        r = await s.get(CustomReportORM, key)
        if r is None:
            raise HTTPException(404, "No such report")
        await s.delete(r)
        await s.commit()
    return Response(status_code=204)
