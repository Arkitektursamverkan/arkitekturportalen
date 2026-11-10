"""Authentication endpoints — local-account login.

Entra-issued tokens come from Microsoft directly; this router only handles
local-account email+password login, returning a JWT signed by us.
"""
from __future__ import annotations

import hmac
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, EmailStr, Field

from app.auth import (
    DUMMY_PASSWORD_HASH,
    hash_password,
    issue_local_token,
    verify_password,
)
from app.dal.postgres_repository import PostgresRepository
from app.dependencies import get_repository

router = APIRouter(prefix="/auth", tags=["auth"])


class LocalLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


class LocalLoginResponse(BaseModel):
    token: str
    expires_in_hours: int


def _get_pg_repo() -> PostgresRepository:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Local accounts require PostgreSQL backend",
        )
    return repo


@router.post("/login", response_model=LocalLoginResponse)
async def login_local(data: LocalLoginRequest) -> LocalLoginResponse:
    repo = _get_pg_repo()
    user = await repo.get_user_by_email(str(data.email))
    # Okänd adress (eller ett konto utan lösenord) jämförs mot en attrapp, så
    # att svaret tar lika lång tid och inte avslöjar vilka konton som finns.
    # bcrypt körs i en tråd för att inte blockera händelseloopen.
    hashed = user.password_hash if user is not None and user.password_hash else DUMMY_PASSWORD_HASH
    password_ok = await run_in_threadpool(verify_password, data.password, hashed)
    if user is None or user.password_hash is None or not password_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Felaktig e-post eller lösenord",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Kontot är spärrat – kontakta en administratör",
        )

    user.last_login_at = datetime.now(UTC)
    await repo.touch_user_login(user.id)
    await repo.record_login_event(user.id)
    token = issue_local_token(user)

    from app.config import settings as cfg

    return LocalLoginResponse(token=token, expires_in_hours=cfg.LOCAL_TOKEN_TTL_HOURS)


# ── The first administrator ──────────────────────────────────────────────────
#
# A new installation has no accounts, and without Entra nobody can sign in to
# create one. As in the Integration Platform and Arkitekten, the first visit
# creates the administrator – only while no user exists at all, and in
# production only with the installation's one-time SETUP_CODE, so a stranger
# who finds the address first cannot. With BOOTSTRAP_ADMIN_EMAILS set, only
# those addresses may claim it. With Entra the form is closed: the bootstrap
# admins sign in with Microsoft.


class SetupStatus(BaseModel):
    needed: bool
    code_required: bool = False


def _code_required() -> bool:
    from app.config import settings as cfg

    return cfg.APP_ENV not in ("development", "test") or bool(cfg.SETUP_CODE)


def _entra_on() -> bool:
    from app.config import settings as cfg

    return bool(cfg.ENTRA_TENANT_ID and cfg.ENTRA_CLIENT_ID)


class FirstAdminCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    setup_code: str | None = Field(default=None, max_length=200)


@router.get("/setup", response_model=SetupStatus)
async def setup_status() -> SetupStatus:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository) or _entra_on():
        return SetupStatus(needed=False)
    return SetupStatus(needed=not await repo.has_users(), code_required=_code_required())


@router.post("/setup", response_model=LocalLoginResponse, status_code=status.HTTP_201_CREATED)
async def create_first_admin(data: FirstAdminCreate) -> LocalLoginResponse:
    from app.config import settings as cfg

    repo = _get_pg_repo()
    if _entra_on():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Logga in med Microsoft – administratörerna kommer från BOOTSTRAP_ADMIN_EMAILS",
        )
    if _code_required():
        if not cfg.SETUP_CODE:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="SETUP_CODE är inte satt – det första kontot kan inte skapas utan den",
            )
        if not hmac.compare_digest((data.setup_code or "").strip(), cfg.SETUP_CODE):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fel engångskod")
    if await repo.has_users():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Det finns redan konton – logga in i stället",
        )
    email = str(data.email).strip().lower()
    allowed = cfg.bootstrap_admin_emails_list
    if allowed and email not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Den e-postadressen får inte skapa det första administratörskontot",
        )
    user = await repo.create_local_user(
        name=data.name.strip(), email=email,
        password_hash=await run_in_threadpool(hash_password, data.password), role="admin",
    )
    await repo.touch_user_login(user.id)
    return LocalLoginResponse(token=issue_local_token(user), expires_in_hours=cfg.LOCAL_TOKEN_TTL_HOURS)
