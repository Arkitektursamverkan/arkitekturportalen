"""Organisation settings, edited under Administration.

The public part (name, short name, brand colour, logo, switched-on modules)
is readable without signing in, since the login page shows it. The rest is admin only."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel

from app import modules as module_catalog
from app.auth import CurrentUser
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_admin
from app.domain_lists import CUSTOM_TYPE, LIST_KEY, DomainLists
from app.domain_lists import parse as parse_lists
from app.models.org_settings import OrgSettingsORM
from app.schemas.navigation import Navigation
from app.services import org_settings
from app.services.org_settings import OrgSettingsError

router = APIRouter(prefix="/org-settings", tags=["org-settings"])


class OrgSettingsValues(BaseModel):
    app_name: str | None = None
    org_name: str | None = None
    org_short_name: str | None = None
    brand_color: str | None = None
    allowed_email_domains: str | None = None
    change_log_departments: str | None = None
    anonymous_read: bool | None = None
    # Keys of the optional modules switched on; [] = none, None = not set.
    modules: list[str] | None = None


class ModuleRead(BaseModel):
    key: str
    name: str
    description: str
    # Set when the module cannot be switched on here (e.g. needs the platform).
    unavailable: str | None = None


class OrgSettingsAdminRead(BaseModel):
    # Set here (None = not set) …
    values: OrgSettingsValues
    # … and what applies when not set (from the environment).
    defaults: OrgSettingsValues
    has_logo: bool
    updated_by: str | None = None
    # Every optional module there is, for the admin page to offer.
    module_catalog: list[ModuleRead]


class OrgSettingsPublic(BaseModel):
    # None = the web app's standard name.
    app_name: str | None = None
    org_name: str | None
    org_short_name: str | None
    brand_color: str | None
    # Changes whenever the logo might have, so it can go in the logo URL.
    logo_version: str | None
    # The optional modules switched on; the web app shows only these.
    modules: list[str]
    # The left menu as an admin arranged it; None = the standard menu.
    navigation: Navigation | None = None
    # Lists switched off and added (app.domain_lists).
    domain_lists: DomainLists = DomainLists()


def _get_pg_repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Organisation settings require PostgreSQL backend",
        )
    return repo


def _public() -> OrgSettingsPublic:
    cur = org_settings.current()
    return OrgSettingsPublic(
        app_name=cur.app_name,
        org_name=cur.org_name,
        org_short_name=cur.org_short_name,
        brand_color=cur.brand_color,
        logo_version=str(int(cur.updated_at.timestamp())) if cur.has_logo and cur.updated_at else None,
        modules=[k for k in module_catalog.KEYS if module_catalog.enabled(k)],
        navigation=Navigation.model_validate(nav) if (nav := org_settings.navigation()) else None,
        domain_lists=parse_lists(org_settings.domain_lists()),
    )


async def _admin_read(repo: PostgresRepository) -> OrgSettingsAdminRead:
    async with repo._session_factory() as s:
        row = await s.get(OrgSettingsORM, 1)
    return OrgSettingsAdminRead(
        values=OrgSettingsValues.model_validate(org_settings.stored()),
        defaults=OrgSettingsValues.model_validate(org_settings.defaults()),
        has_logo=org_settings.current().has_logo,
        updated_by=row.updated_by if row else None,
        module_catalog=[
            ModuleRead(key=m.key, name=m.name, description=m.description,
                       unavailable=module_catalog.unavailable_reason(m.key))
            for m in module_catalog.MODULES
        ],
    )


def _who(user: CurrentUser) -> str | None:
    return user.email or user.name or None


@router.get("/public", response_model=OrgSettingsPublic)
async def get_public_settings() -> OrgSettingsPublic:
    return _public()


@router.get("/logo")
async def get_logo() -> Response:
    logo = org_settings.logo()
    if logo is None:
        raise HTTPException(status_code=404, detail="Ingen logotyp")
    data, content_type = logo
    return Response(
        content=data,
        media_type=content_type,
        headers={
            # An SVG opened directly must not run scripts on this origin.
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "public, max-age=300",
        },
    )


@router.get("", response_model=OrgSettingsAdminRead)
async def get_settings(_admin: CurrentUser = Depends(require_admin)) -> OrgSettingsAdminRead:
    return await _admin_read(_get_pg_repo())


@router.put("", response_model=OrgSettingsAdminRead)
async def update_settings(
    data: OrgSettingsValues, admin: CurrentUser = Depends(require_admin),
) -> OrgSettingsAdminRead:
    repo = _get_pg_repo()
    try:
        await org_settings.save(repo._session_factory, data.model_dump(exclude_unset=True), _who(admin))
    except OrgSettingsError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return await _admin_read(repo)


@router.put("/navigation", response_model=OrgSettingsPublic)
async def update_navigation(data: Navigation, admin: CurrentUser = Depends(require_admin)) -> OrgSettingsPublic:
    """Arrange the left menu for everyone."""
    repo = _get_pg_repo()
    await org_settings.set_navigation(repo._session_factory, data.model_dump(mode="json"), _who(admin))
    return _public()


@router.delete("/navigation", response_model=OrgSettingsPublic)
async def reset_navigation(admin: CurrentUser = Depends(require_admin)) -> OrgSettingsPublic:
    """Back to the standard menu."""
    repo = _get_pg_repo()
    await org_settings.set_navigation(repo._session_factory, None, _who(admin))
    return _public()


@router.put("/domain-lists", response_model=OrgSettingsPublic)
async def update_domain_lists(data: DomainLists, admin: CurrentUser = Depends(require_admin)) -> OrgSettingsPublic:
    """Switch lists off and on, and add, change and remove own lists."""
    repo = _get_pg_repo()
    current = parse_lists(org_settings.domain_lists())
    # A key is what the objects point at, so a list keeps it, and goes only when empty.
    removed = {c.key for c in current.custom} - {c.key for c in data.custom}
    if removed:
        for archived in (False, True):
            for n in await repo.list_nodes(node_type=CUSTOM_TYPE, archived=archived, limit=100_000):
                if (n.attributes or {}).get(LIST_KEY) in removed:
                    raise HTTPException(
                        status_code=409,
                        detail="Listan har objekt. Stäng av den, eller ta bort objekten först.",
                    )
    await org_settings.set_domain_lists(repo._session_factory, data.model_dump(mode="json"), _who(admin))
    return _public()


@router.put("/logo", response_model=OrgSettingsAdminRead)
async def upload_logo(
    file: UploadFile = File(...), admin: CurrentUser = Depends(require_admin),
) -> OrgSettingsAdminRead:
    repo = _get_pg_repo()
    data = await file.read(org_settings.LOGO_MAX_BYTES + 1)
    try:
        await org_settings.set_logo(repo._session_factory, data, _who(admin))
    except OrgSettingsError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return await _admin_read(repo)


@router.delete("/logo", response_model=OrgSettingsAdminRead)
async def delete_logo(admin: CurrentUser = Depends(require_admin)) -> OrgSettingsAdminRead:
    repo = _get_pg_repo()
    await org_settings.set_logo(repo._session_factory, None, _who(admin))
    return await _admin_read(repo)
