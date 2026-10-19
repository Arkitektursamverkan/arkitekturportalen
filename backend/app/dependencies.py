"""FastAPI dependency injection: repository selection, auth, current user."""
from __future__ import annotations

from typing import Annotated

import structlog
from fastapi import Header, HTTPException, status

from app.auth import AuthError, CurrentUser, verify_token
from app.config import settings
from app.dal.graph_repository import GraphRepository
from app.dal.postgres_repository import PostgresRepository

log = structlog.get_logger(__name__)

_repo: GraphRepository | None = None


def set_repository(repo: GraphRepository) -> None:
    global _repo
    _repo = repo


def get_repository() -> GraphRepository:
    if _repo is None:
        raise RuntimeError("Repository not initialised — check lifespan setup")
    return _repo


# ── User auth: JWT (with API-key fallback during transition) ─────────────────

async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    x_api_key: Annotated[str | None, Header()] = None,
) -> CurrentUser:
    """Return the current authenticated user.

    Accepts either:
      - Authorization: Bearer <jwt>  → verify against Entra, find/create ea_users row
      - X-Api-Key: <key>             → synthetic system user (for scripts; admin role)

    Raises 401 if neither is valid.
    """
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        try:
            token_type, claims = verify_token(token)
        except AuthError as e:
            log.warning("auth.token_verify_failed", reason=str(e))
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))

        repo = get_repository()
        if not isinstance(repo, PostgresRepository):
            raise HTTPException(
                status_code=status.HTTP_501_NOT_IMPLEMENTED,
                detail="JWT auth requires PostgreSQL backend",
            )
        try:
            user = await repo.find_or_create_user_from_claims(token_type, claims)
        except AuthError as e:
            log.warning(
                "auth.user_resolve_failed",
                reason=str(e),
                upn=claims.get("preferred_username") or claims.get("upn"),
                oid=claims.get("oid"),
            )
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))
        return CurrentUser(
            id=str(user.id),
            entra_oid=user.entra_oid or "",
            name=user.name,
            email=user.email,
            role=user.role,
        )

    if x_api_key and x_api_key == settings.API_KEY:
        return CurrentUser(
            id="system",
            entra_oid="",
            name="System",
            email="",
            role="system",
        )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Missing or invalid authentication",
    )


async def require_user(
    authorization: Annotated[str | None, Header()] = None,
    x_api_key: Annotated[str | None, Header()] = None,
) -> CurrentUser:
    """Any authenticated user (any role)."""
    return await get_current_user(authorization=authorization, x_api_key=x_api_key)


async def require_admin(
    authorization: Annotated[str | None, Header()] = None,
    x_api_key: Annotated[str | None, Header()] = None,
) -> CurrentUser:
    """Admin role required (or service via API key)."""
    user = await get_current_user(authorization=authorization, x_api_key=x_api_key)
    if user.role not in ("admin", "system"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    return user


async def require_editor(
    authorization: Annotated[str | None, Header()] = None,
    x_api_key: Annotated[str | None, Header()] = None,
) -> CurrentUser:
    """Editor capabilities: superuser, admin, or service. Used for creating
    and editing nodes/edges and running imports — not destructive or
    administrative actions, which require_admin gates separately."""
    user = await get_current_user(authorization=authorization, x_api_key=x_api_key)
    if user.role not in ("superuser", "admin", "system"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Editor role required")
    return user
