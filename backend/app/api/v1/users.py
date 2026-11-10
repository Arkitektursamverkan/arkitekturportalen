"""User management endpoints."""
from __future__ import annotations

from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from app.access import effective_access
from app.auth import CurrentUser, hash_password
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository, require_admin, require_user
from app.schemas.user import (
    LocalUserCreate,
    PasswordReset,
    ProvisionCandidate,
    ProvisionRequest,
    ProvisionResult,
    ProvisionSkipped,
    UserActiveUpdate,
    UserMe,
    UserRead,
    UserRoleUpdate,
)
from app.services import org_settings

log = structlog.get_logger(__name__)

DEFAULT_PROVISION_ATTRIBUTES = ["systemförvaltare", "systemägare", "systemadministratör"]


class HomeShortcuts(BaseModel):
    paths: list[str] = Field(default_factory=list, max_length=50)

router = APIRouter(prefix="/users", tags=["users"])


def _user_to_read(u) -> UserRead:  # type: ignore[no-untyped-def]
    return UserRead(
        id=u.id,
        entra_oid=u.entra_oid,
        name=u.name,
        email=u.email,
        role=u.role,
        is_local=u.password_hash is not None,
        is_provisioned=u.entra_oid is None and u.password_hash is None,
        is_active=u.is_active,
        created_at=u.created_at,
        last_login_at=u.last_login_at,
    )


def _get_pg_repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="User management requires PostgreSQL backend",
        )
    return repo


@router.get("/me", response_model=UserMe)
async def get_me(user: CurrentUser = Depends(require_user)) -> UserMe:
    type_access, servers = await effective_access(user)
    return UserMe(
        id=user.id, name=user.name, email=user.email, role=user.role,
        access={"servers": servers}, type_access=type_access,
    )


@router.get("", response_model=list[UserRead])
async def list_users(_admin: CurrentUser = Depends(require_admin)) -> list[UserRead]:
    repo = _get_pg_repo()
    rows = await repo.list_users()
    return [_user_to_read(r) for r in rows]


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_local_user(
    data: LocalUserCreate,
    _admin: CurrentUser = Depends(require_admin),
) -> UserRead:
    repo = _get_pg_repo()
    if await repo.get_user_by_email(data.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Det finns redan en användare med den e-postadressen",
        )
    row = await repo.create_local_user(
        name=data.name,
        email=data.email,
        password_hash=await run_in_threadpool(hash_password, data.password),
        role=data.role,
    )
    return _user_to_read(row)


@router.get("/provision-candidates", response_model=list[ProvisionCandidate])
async def list_provision_candidates(
    attribute_keys: str | None = None,
    _admin: CurrentUser = Depends(require_admin),
) -> list[ProvisionCandidate]:
    """Matchningslista: people found in system-role attributes on nodes,
    with a suggested email (fornamn.efternamn@domain) for each, so they can
    be pre-provisioned before their first login."""
    repo = _get_pg_repo()
    keys = [k.strip() for k in (attribute_keys or "").split(",") if k.strip()] or DEFAULT_PROVISION_ATTRIBUTES
    domains = org_settings.current().allowed_email_domains
    domain = domains[0] if domains else "example.org"
    rows = await repo.list_user_provision_candidates(keys, domain)
    return [ProvisionCandidate(**r) for r in rows]


@router.post("/provision", response_model=ProvisionResult, status_code=status.HTTP_201_CREATED)
async def provision_users(
    data: ProvisionRequest,
    _admin: CurrentUser = Depends(require_admin),
) -> ProvisionResult:
    """Create pre-provisioned users (no password, no Entra oid). They are
    linked to their Entra identity by email on first login."""
    repo = _get_pg_repo()
    created, skipped = await repo.provision_users(
        [{"name": u.name, "email": u.email, "role": u.role} for u in data.users]
    )
    return ProvisionResult(
        created=[_user_to_read(r) for r in created],
        skipped=[ProvisionSkipped(**s) for s in skipped],
    )


@router.patch("/{user_id}", response_model=UserRead)
async def update_user_role(
    user_id: UUID,
    data: UserRoleUpdate,
    admin: CurrentUser = Depends(require_admin),
) -> UserRead:
    repo = _get_pg_repo()
    acting_user_id = UUID(admin.id) if admin.role != "system" else None
    try:
        row = await repo.update_user_role(user_id, data.role, acting_user_id=acting_user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    log.info("user.role_changed", user_id=str(user_id), email=row.email,
             new_role=row.role, by=admin.email or admin.id)
    return _user_to_read(row)


@router.put("/{user_id}/active", response_model=UserRead)
async def set_user_active(
    user_id: UUID,
    data: UserActiveUpdate,
    admin: CurrentUser = Depends(require_admin),
) -> UserRead:
    """Spärra eller häv spärren för ett konto. Ett spärrat konto kan inte
    logga in, och de token det redan har avvisas."""
    repo = _get_pg_repo()
    acting_user_id = UUID(admin.id) if admin.role != "system" else None
    try:
        row = await repo.set_user_active(user_id, data.active, acting_user_id=acting_user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    log.info("user.active_changed", user_id=str(user_id), email=row.email,
             active=row.is_active, by=admin.email or admin.id)
    return _user_to_read(row)


@router.delete("/{user_id}/password", response_model=UserRead)
async def link_user_to_entra(
    user_id: UUID,
    admin: CurrentUser = Depends(require_admin),
) -> UserRead:
    """Koppla ett lokalt konto till Microsoft-inloggningen: lösenordet tas
    bort, och vid nästa Microsoft-inloggning med samma e-postadress kopplas
    kontot (med roll och historik) till den identiteten. Ett lokalt konto
    kopplas aldrig automatiskt – det beslutet tar en administratör här."""
    repo = _get_pg_repo()
    existing = await repo.get_user(user_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="User not found")
    if existing.password_hash is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Kontot har inget lösenord",
        )
    row = await repo.set_user_password(user_id, None)
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    log.info("user.local_to_entra", user_id=str(user_id), email=row.email, by=admin.email or admin.id)
    return _user_to_read(row)


@router.post("/{user_id}/password", response_model=UserRead)
async def reset_user_password(
    user_id: UUID,
    data: PasswordReset,
    _admin: CurrentUser = Depends(require_admin),
) -> UserRead:
    repo = _get_pg_repo()
    existing = await repo.get_user(user_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="User not found")
    if existing.password_hash is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Endast lokala konton kan ha lösenord",
        )
    # Nytt lösenord höjer tokenversionen: kontots gamla token slutar gälla.
    row = await repo.set_user_password(user_id, await run_in_threadpool(hash_password, data.password))
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_to_read(row)


@router.get("/me/shortcuts", response_model=HomeShortcuts)
async def get_my_shortcuts(user: CurrentUser = Depends(require_user)) -> HomeShortcuts:
    if user.id == "system":
        return HomeShortcuts(paths=[])
    repo = _get_pg_repo()
    paths = await repo.get_home_shortcuts(UUID(user.id))
    return HomeShortcuts(paths=paths)


@router.put("/me/shortcuts", response_model=HomeShortcuts)
async def set_my_shortcuts(
    data: HomeShortcuts,
    user: CurrentUser = Depends(require_user),
) -> HomeShortcuts:
    if user.id == "system":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="System users have no shortcuts")
    repo = _get_pg_repo()
    paths = await repo.set_home_shortcuts(UUID(user.id), data.paths)
    return HomeShortcuts(paths=paths)
