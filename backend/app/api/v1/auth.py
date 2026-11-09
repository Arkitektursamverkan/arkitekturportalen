"""Authentication endpoints — local-account login.

Entra-issued tokens come from Microsoft directly; this router only handles
local-account email+password login, returning a JWT signed by us.
"""
from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from app.auth import hash_password, issue_local_token, verify_password
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
    if user is None or user.password_hash is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Felaktig e-post eller lösenord",
        )
    if not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Felaktig e-post eller lösenord",
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
# creates the administrator – only while no user exists at all. With
# BOOTSTRAP_ADMIN_EMAILS set, only those addresses may claim it, so a stranger
# who finds the address first cannot.


class SetupStatus(BaseModel):
    needed: bool


class FirstAdminCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)


@router.get("/setup", response_model=SetupStatus)
async def setup_status() -> SetupStatus:
    repo = get_repository()
    if not isinstance(repo, PostgresRepository):
        return SetupStatus(needed=False)
    return SetupStatus(needed=not await repo.has_users())


@router.post("/setup", response_model=LocalLoginResponse, status_code=status.HTTP_201_CREATED)
async def create_first_admin(data: FirstAdminCreate) -> LocalLoginResponse:
    from app.config import settings as cfg

    repo = _get_pg_repo()
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
        password_hash=hash_password(data.password), role="admin",
    )
    await repo.touch_user_login(user.id)
    return LocalLoginResponse(token=issue_local_token(user), expires_in_hours=cfg.LOCAL_TOKEN_TTL_HOURS)
