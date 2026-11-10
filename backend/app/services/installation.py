"""What the installation knows about itself, so that nobody has to type it in.

Two addresses, kept in ea_installation and cached in the process (one API
process per installation, like the organisation settings):

- **portal_url** – the portal's public address. PDF_APP_BASE_URL wins when it
  is set (compose installations set it). Otherwise it is learned from the
  requests that reach the API through the portal's web (nginx), which passes
  on the Host the browser used and the scheme the proxy in front saw. Only a
  routing proxy (Render, Caddy) delivers those requests, and it only accepts
  the installation's own host names, so the Host is the portal's. Internal
  callers (Arkitekten, the platform) use internal names – no dot, an IP or
  localhost – and are never learned from. A custom domain is not replaced by
  the platform's own address (*.onrender.com) once it has been seen.
- **arkitekten_url** – Arkitekten's public address, registered by Arkitekten at
  startup (PUT /api/v1/installation/arkitekten). The portal's web links to it
  when ARKITEKTEN_URL is not set on the web.
- **platform_url** – the Integration Platform's internal API address,
  registered by the platform at startup (PUT /api/v1/installation/plattform).
  Used when INTEGRATION_PLATFORM_URL is not set (app.platform_access). This way
  the portal's service needs no reference to the platform's: on Render a
  reference in each direction made every Blueprint sync end in error.

Without PostgreSQL (the neo4j engine) the values live in the process only and
are learned again after a restart."""
from __future__ import annotations

import ipaddress
import re
from collections.abc import Mapping
from typing import Any
from urllib.parse import urlsplit

import structlog
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import settings
from app.models.installation import InstallationFactORM

log = structlog.get_logger(__name__)

PORTAL_URL = "portal_url"
ARKITEKTEN_URL = "arkitekten_url"
PLATFORM_URL = "platform_url"
_KEYS = (PORTAL_URL, ARKITEKTEN_URL, PLATFORM_URL)

# Addresses the hosting platform gives every service; a custom domain is preferred.
_PLATFORM_SUFFIXES = (".onrender.com",)
_HOST_RE = re.compile(r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$")
URL_MAX = 300

_values: dict[str, str] = {}
_session_factory: async_sessionmaker[AsyncSession] | None = None


class InstallationError(ValueError):
    pass


async def load(session_factory: async_sessionmaker[AsyncSession] | None) -> None:
    """Read the stored values (at startup). None = no database: memory only."""
    global _session_factory
    _session_factory = session_factory
    _values.clear()
    if session_factory is None:
        return
    async with session_factory() as s:
        from sqlalchemy import select

        rows = (await s.execute(select(InstallationFactORM))).scalars().all()
    _values.update({r.key: r.value for r in rows if r.key in _KEYS})


def reset() -> None:
    """Forget everything (tests)."""
    global _session_factory
    _session_factory = None
    _values.clear()


async def _store(key: str, value: str) -> None:
    _values[key] = value
    if _session_factory is None:
        return
    async with _session_factory() as s:
        row = await s.get(InstallationFactORM, key)
        if row is None:
            s.add(InstallationFactORM(key=key, value=value))
        else:
            row.value = value
        await s.commit()


def portal_url() -> str | None:
    """The portal's public address (no trailing slash), or None while unknown."""
    configured = settings.PDF_APP_BASE_URL.strip().rstrip("/")
    return configured or _values.get(PORTAL_URL) or None


def arkitekten_url() -> str | None:
    return _values.get(ARKITEKTEN_URL) or None


def platform_url() -> str | None:
    """The address the platform registered (an API base URL), or None."""
    return _values.get(PLATFORM_URL) or None


# ── Learning the portal's own address ───────────────────────────────────────

def public_host(host: str | None) -> str | None:
    """The host name of a Host header if it is a public one, else None.

    Public = a DNS name with a dot. IP addresses, localhost and single-label
    names (Docker and Render internal names) are what internal callers use."""
    if not host:
        return None
    host = host.strip().lower()
    if host.startswith("["):  # IPv6 literal
        return None
    name, _, port = host.partition(":")
    if port and not port.isdigit():
        return None
    try:
        ipaddress.ip_address(name)
        return None
    except ValueError:
        pass
    if name == "localhost" or name.endswith(".localhost") or not _HOST_RE.match(name):
        return None
    return host


def address_from_request(host: str | None, forwarded_proto: str | None) -> str | None:
    """The public address a request was made to, or None."""
    public = public_host(host)
    if public is None:
        return None
    proto = (forwarded_proto or "").split(",")[0].strip().lower()
    scheme = "https" if proto == "https" else "http"
    return f"{scheme}://{public}"


def _is_platform_address(url: str) -> bool:
    host = (urlsplit(url).hostname or "").lower()
    return host.endswith(_PLATFORM_SUFFIXES)


def came_through_web(path: str, headers: Mapping[str, str], status: int) -> bool:
    """Was this a request the portal's web (nginx) passed on from a browser?

    The web sets X-Forwarded-Proto on everything it sends to /api. A platform's
    own probes reach the API directly – Render checks a new service with
    "HEAD /" and the service's own name (portal-api-….onrender.com) – and
    carry no such header. Only successful API requests count.
    REGRESSION: Render's probe taught the portal the private service's name."""
    return bool(headers.get("x-forwarded-proto")) and path.startswith("/api/") and status < 400


async def learn_portal_url(host: str | None, forwarded_proto: str | None) -> None:
    """Remember the address of a request that came through the portal's web.

    Does nothing when PDF_APP_BASE_URL is set or the address is not public;
    writes only when the value changes."""
    if settings.PDF_APP_BASE_URL.strip():
        return
    url = address_from_request(host, forwarded_proto)
    if url is None:
        return
    current = _values.get(PORTAL_URL)
    if current == url:
        return
    if current and _is_platform_address(url) and not _is_platform_address(current):
        return
    # http never replaces https for the same host (a request past the proxy).
    if current and current.startswith("https://") and url == "http://" + current[len("https://"):]:
        return
    try:
        await _store(PORTAL_URL, url)
    except Exception as e:  # never break the request that taught us
        log.warning("installation.portal_url_not_saved", error=str(e))
        return
    log.info("installation.portal_url_learned", url=url, previous=current)


# ── Arkitekten's registration ───────────────────────────────────────────────

def clean_url(value: Any) -> str:
    if not isinstance(value, str):
        raise InstallationError("Adressen ska vara text")
    url = value.strip().rstrip("/")
    if len(url) > URL_MAX:
        raise InstallationError(f"Adressen får vara högst {URL_MAX} tecken")
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise InstallationError("Adressen ska börja med http:// eller https://")
    if parts.query or parts.fragment or parts.username or parts.password:
        raise InstallationError("Adressen får inte ha frågedel, fragment eller inloggningsuppgifter")
    return url


async def register_arkitekten(value: Any) -> str:
    url = clean_url(value)
    previous = _values.get(ARKITEKTEN_URL)
    if previous != url:
        await _store(ARKITEKTEN_URL, url)
        log.info("installation.arkitekten_registered", url=url, previous=previous)
    return url


# ── The platform's registration ─────────────────────────────────────────────

async def register_platform(value: Any) -> str:
    """The platform's internal address, e.g. http://10.0.3.4:8000/api/v1.

    Only the platform holds the shared secret this is guarded by, and the
    address only receives the platform's own admin key – so a registration
    cannot send the key anywhere the platform could not already read it."""
    url = clean_url(value)
    previous = _values.get(PLATFORM_URL)
    if previous != url:
        await _store(PLATFORM_URL, url)
        log.info("installation.platform_registered", url=url, previous=previous)
    return url


# ── What other services of the installation may fetch ──────────────────────

def entra_scope() -> str:
    return f"api://{settings.ENTRA_CLIENT_ID}/access_as_user"


def snapshot(include_secret: bool) -> dict[str, Any]:
    """GET /api/v1/installation – the shared settings of the installation."""
    entra: dict[str, Any] | None = None
    if settings.ENTRA_TENANT_ID and settings.ENTRA_CLIENT_ID:
        entra = {
            "tenant_id": settings.ENTRA_TENANT_ID,
            "client_id": settings.ENTRA_CLIENT_ID,
            "api_scope": entra_scope(),
            "bootstrap_admin_emails": settings.bootstrap_admin_emails_list,
        }
        if include_secret and settings.ENTRA_CLIENT_SECRET:
            entra["client_secret"] = settings.ENTRA_CLIENT_SECRET
    return {"portal_url": portal_url(), "arkitekten_url": arkitekten_url(), "entra": entra}
