"""Addresses of the installation's other services, as the environment gives them.

docker compose names a service by its own name (``http://plattform-api:8000/api/v1``),
but a platform such as Render hands out an internal ``host:port`` that is only
known after the service exists – its blueprints can pass that, not a whole URL.
Both forms are accepted, so the same variable works in either place.
"""
from __future__ import annotations


def api_base(raw: str | None) -> str:
    """The API base URL for a configured address; "" when none is set.

    ``host:port`` (no scheme) means plain HTTP on the internal network and the
    service's ``/api/v1``; a full URL is used as it is."""
    value = (raw or "").strip().rstrip("/")
    if not value:
        return ""
    if "://" not in value:
        return f"http://{value}/api/v1"
    return value


def asyncpg_url(raw: str) -> str:
    """A PostgreSQL URL in the form SQLAlchemy's asyncpg driver needs.

    Managed databases (Render, Heroku and others) hand out ``postgres://`` or
    ``postgresql://``; asyncpg also spells TLS ``ssl=`` where libpq says
    ``sslmode=``. Anything else is left untouched."""
    value = raw.strip()
    for prefix in ("postgres://", "postgresql://"):
        if value.startswith(prefix):
            value = "postgresql+asyncpg://" + value[len(prefix):]
            break
    if value.startswith("postgresql+asyncpg://") and "sslmode=" in value:
        value = value.replace("sslmode=", "ssl=")
    return value
