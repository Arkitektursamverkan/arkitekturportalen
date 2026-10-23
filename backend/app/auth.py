"""Entra ID + local-account JWT verification and user resolution.

Two token formats are accepted:
  - **Entra-issued (RS256)** — verified against Microsoft's JWKS. The
    preferred_username must match ALLOWED_EMAIL_DOMAINS. Users are
    auto-created in ea_users on first login.
  - **Locally-issued (HS256)** — verified against LOCAL_AUTH_SECRET. These
    are issued by /auth/login when a user signs in with email + password
    against an entry an admin created in ea_users.

Bootstrap admins (BOOTSTRAP_ADMIN_EMAILS) become admin on first Entra login.
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import bcrypt
import httpx
import jwt
import structlog
from jwt import PyJWKClient
from sqlalchemy import select

from app.config import settings
from app.models.user import UserORM
from app.services import org_settings

log = structlog.get_logger(__name__)

LOCAL_ISSUER = "ea-application"
LOCAL_AUDIENCE = "ea-application"


@dataclass
class CurrentUser:
    id: str
    entra_oid: str
    name: str
    email: str
    role: str  # "admin" | "superuser" | "user" | "system" (last is API-key fallback)


_JWKS_CLIENT: PyJWKClient | None = None
_JWKS_CACHE_TS: float = 0.0
_JWKS_TTL_SECONDS: float = 3600.0


def _get_jwks_client() -> PyJWKClient:
    global _JWKS_CLIENT, _JWKS_CACHE_TS
    now = time.time()
    if _JWKS_CLIENT is None or (now - _JWKS_CACHE_TS) > _JWKS_TTL_SECONDS:
        _JWKS_CLIENT = PyJWKClient(settings.entra_jwks_uri, cache_keys=True)
        _JWKS_CACHE_TS = now
    return _JWKS_CLIENT


class AuthError(Exception):
    """Raised when token verification or domain check fails."""


# ── Password hashing ────────────────────────────────────────────────────────

# bcrypt only uses the first 72 bytes of a password. bcrypt 4 cut longer
# passwords silently; bcrypt 5 refuses them. Cutting here keeps the hashes
# made before bcrypt 5 valid and lets passwords up to the schema's 128
# characters through, exactly as before.
_BCRYPT_MAX_BYTES = 72


def _password_bytes(plain: str) -> bytes:
    return plain.encode()[:_BCRYPT_MAX_BYTES]


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(_password_bytes(plain), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_password_bytes(plain), hashed.encode())
    except ValueError:
        return False


# ── Local JWT issue/verify ──────────────────────────────────────────────────

def issue_local_token(user: UserORM) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "name": user.name,
        "email": user.email,
        "iss": LOCAL_ISSUER,
        "aud": LOCAL_AUDIENCE,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=settings.LOCAL_TOKEN_TTL_HOURS)).timestamp()),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.LOCAL_AUTH_SECRET, algorithm="HS256")


def _verify_local(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(
            token,
            settings.LOCAL_AUTH_SECRET,
            algorithms=["HS256"],
            audience=LOCAL_AUDIENCE,
            issuer=LOCAL_ISSUER,
        )
    except jwt.PyJWTError as e:
        raise AuthError(f"Invalid local token: {e}") from e


def _verify_entra(token: str) -> dict[str, Any]:
    if not settings.ENTRA_TENANT_ID or not settings.ENTRA_CLIENT_ID:
        raise AuthError("Entra auth not configured")
    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            audience=settings.entra_audience,
        )
    except jwt.PyJWTError as e:
        raise AuthError(f"Invalid Entra token: {e}") from e

    iss = claims.get("iss")
    if iss not in settings.entra_issuers:
        raise AuthError(f"Invalid Entra token: unexpected issuer {iss!r}")

    upn = (claims.get("preferred_username") or claims.get("upn") or "").lower()
    if not upn:
        raise AuthError("Token missing preferred_username/upn claim")
    if not org_settings.email_domain_allowed(upn):
        raise AuthError(f"Email domain not allowed: {upn}")
    return claims


def verify_token(token: str) -> tuple[Literal["entra", "local"], dict[str, Any]]:
    """Verify a token (either Entra RS256 or local HS256). Returns (type, claims)."""
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as e:
        raise AuthError(f"Malformed token: {e}") from e

    alg = header.get("alg")
    if alg == "RS256":
        return "entra", _verify_entra(token)
    if alg == "HS256":
        return "local", _verify_local(token)
    raise AuthError(f"Unsupported token algorithm: {alg}")


async def find_or_create_user(
    session: Any,
    token_type: Literal["entra", "local"],
    claims: dict[str, Any],
) -> UserORM:
    """Resolve a token's claims to a UserORM row.

    Entra: find by oid; else link an existing row by email (pre-provisioned
    or local account); else auto-create (bootstrap-admin lookup).
    Local: find by user-id (sub); the user must already exist (admin-created).
    """
    now = datetime.now(timezone.utc)

    if token_type == "entra":
        oid = claims.get("oid")
        if not oid:
            raise AuthError("Token missing oid claim")
        row = (await session.execute(select(UserORM).where(UserORM.entra_oid == oid))).scalar_one_or_none()
        name = claims.get("name") or claims.get("preferred_username") or claims.get("upn") or ""
        email = (
            claims.get("preferred_username")
            or claims.get("upn")
            or claims.get("email")
            or ""
        ).lower()
        if row is None and email:
            # Pre-provisioned (or local) account with the same email: link the
            # Entra identity to it instead of creating a duplicate row.
            row = (
                await session.execute(select(UserORM).where(UserORM.email == email))
            ).scalar_one_or_none()
            if row is not None:
                row.entra_oid = oid
                if email in settings.bootstrap_admin_emails_list and row.role != "admin":
                    row.role = "admin"
                log.info("user.linked", oid=oid, email=email, role=row.role)
        if row is None:
            is_bootstrap_admin = email in settings.bootstrap_admin_emails_list
            row = UserORM(
                entra_oid=oid,
                name=name,
                email=email,
                role="admin" if is_bootstrap_admin else "user",
                last_login_at=now,
            )
            session.add(row)
            await session.flush()
            log.info("user.created", oid=oid, email=email, role=row.role)
        else:
            if name and row.name != name:
                row.name = name
            if email and row.email != email:
                row.email = email
            row.last_login_at = now
        return row

    # Local
    user_id = claims.get("sub")
    if not user_id:
        raise AuthError("Local token missing sub claim")
    try:
        row = await session.get(UserORM, uuid.UUID(user_id))
    except (TypeError, ValueError):
        raise AuthError("Local token has invalid sub claim")
    if row is None or row.password_hash is None:
        raise AuthError("Local user no longer exists")
    row.last_login_at = now
    return row


async def fetch_jwks_health() -> bool:
    """Best-effort check that the JWKS endpoint is reachable."""
    if not settings.ENTRA_TENANT_ID:
        return False
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(settings.entra_jwks_uri)
            return r.status_code == 200
    except Exception:
        return False
