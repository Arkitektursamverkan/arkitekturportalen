"""Report tags — the headings the "Rapporter" listing is grouped under.

Everyone who can see a report can read the tags (the menu needs them on every
page load); only admins change them.
"""
from __future__ import annotations

import re
import unicodedata
from collections import defaultdict
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.auth import CurrentUser
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_admin, require_user
from app.models.report_tag import ReportTagORM
from app.schemas.report_tag import (
    SLUG_RE,
    ReportTagAssignment,
    ReportTagCreate,
    ReportTagRead,
    ReportTagUpdate,
)

router = APIRouter(prefix="/report-tags", tags=["report-tags"])


def _get_pg_repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Rapporttaggar kräver PostgreSQL-backend",
        )
    return repo


def _slugify(name: str) -> str:
    """"Säkerhet & kontinuitet" → "sakerhet-kontinuitet". Swedish letters fold
    to ASCII so the slug stays URL- and code-friendly."""
    folded = unicodedata.normalize("NFKD", name.lower())
    folded = folded.replace("ä", "a").replace("å", "a").replace("ö", "o")
    ascii_only = folded.encode("ascii", "ignore").decode("ascii")
    # Truncate before stripping: a cut that lands on a separator would
    # otherwise leave a trailing hyphen, which SLUG_RE rejects.
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", ascii_only))[:50].strip("-")


def _to_read(tag: ReportTagORM, report_keys: list[str]) -> ReportTagRead:
    return ReportTagRead(
        id=tag.id,
        slug=tag.slug,
        name=tag.name,
        color=tag.color,
        sort_order=tag.sort_order,
        report_keys=sorted(report_keys),
    )


async def _list_with_keys(repo: PostgresRepository) -> list[ReportTagRead]:
    tags = await repo.list_report_tags()
    by_tag: dict[UUID, list[str]] = defaultdict(list)
    for link in await repo.list_report_tag_links():
        by_tag[link.tag_id].append(link.report_key)
    return [_to_read(t, by_tag.get(t.id, [])) for t in tags]


@router.get("", response_model=list[ReportTagRead])
async def list_report_tags(
    _user: CurrentUser = Depends(require_user),
) -> list[ReportTagRead]:
    """Every tag with the reports filed under it, in menu order."""
    return await _list_with_keys(_get_pg_repo())


@router.post("", response_model=ReportTagRead, status_code=status.HTTP_201_CREATED)
async def create_report_tag(
    data: ReportTagCreate,
    _admin: CurrentUser = Depends(require_admin),
) -> ReportTagRead:
    repo = _get_pg_repo()
    slug = (data.slug or _slugify(data.name)).strip().lower()
    if not SLUG_RE.match(slug):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Taggens namn ger inget giltigt id — använd bokstäver eller siffror",
        )
    if await repo.get_report_tag_by_slug(slug) is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f'Det finns redan en tagg med id "{slug}"',
        )
    row = await repo.create_report_tag(
        slug=slug,
        name=data.name,
        color=data.color,
        sort_order=data.sort_order,
        report_keys=data.report_keys,
    )
    return _to_read(row, data.report_keys)


@router.patch("/{tag_id}", response_model=ReportTagRead)
async def update_report_tag(
    tag_id: UUID,
    data: ReportTagUpdate,
    _admin: CurrentUser = Depends(require_admin),
) -> ReportTagRead:
    repo = _get_pg_repo()
    row = await repo.update_report_tag(
        tag_id,
        name=data.name.strip() if data.name is not None else None,
        color=data.color,
        sort_order=data.sort_order,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Taggen hittades inte")
    links = [ln.report_key for ln in await repo.list_report_tag_links() if ln.tag_id == tag_id]
    return _to_read(row, links)


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report_tag(
    tag_id: UUID,
    _admin: CurrentUser = Depends(require_admin),
) -> Response:
    """The reports keep existing — they just lose this heading."""
    repo = _get_pg_repo()
    if not await repo.delete_report_tag(tag_id):
        raise HTTPException(status_code=404, detail="Taggen hittades inte")
    return Response(status_code=204)


@router.put("/assignments/{report_key}", response_model=list[ReportTagRead])
async def set_report_tags(
    report_key: str,
    data: ReportTagAssignment,
    _admin: CurrentUser = Depends(require_admin),
) -> list[ReportTagRead]:
    """Replace one report's tags and return the full listing, so the menu and
    the overview page regroup from a single response."""
    repo = _get_pg_repo()
    key = report_key.strip()
    if not key or len(key) > 120:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ogiltig rapportnyckel")
    await repo.set_report_tags(key, data.tag_ids)
    return await _list_with_keys(repo)
