"""Where the portal may call the Integration Platform, and with which key.

The portal talks to the platform on an administrator's behalf (import, sync
profiles). Left open, that is a way to make the server call any address – and
to hand the installation's own platform key to it. So:

  * Only allowed addresses are called: the installation's own
    INTEGRATION_PLATFORM_URL (or, when it is not set, the address the platform
    registered – app.services.installation) and, for an installation that really has more than
    one platform, the addresses in INTEGRATION_PLATFORM_ALLOWED_URLS (separated
    by commas). Anything else is refused before a request is made.
  * The installation's key (INTEGRATION_PLATFORM_API_KEY, or the admin key) goes
    only to INTEGRATION_PLATFORM_URL itself. Another allowed platform needs its
    own key in the profile.

Addresses are compared by origin (scheme, host and port): the API path below
it is the platform's business, not a different server.

The environment is read on every call, so tests and a changed setting need no
restart of this module.
"""
from __future__ import annotations

import os
from urllib.parse import urlsplit

from app.internal_url import api_base
from app.services import installation


class PlatformAddressError(ValueError):
    """The address is not one the portal may call."""


def configured_url() -> str:
    """The installation's own platform, as an API base URL ("" when unknown).
    The environment wins; otherwise the address the platform registered."""
    return api_base(os.environ.get("INTEGRATION_PLATFORM_URL")) or api_base(installation.platform_url())


def installation_key() -> str:
    """The installation's platform key. The admin key reads too when no
    separate read key is set."""
    return (
        os.environ.get("INTEGRATION_PLATFORM_API_KEY")
        or os.environ.get("INTEGRATION_PLATFORM_ADMIN_KEY", "")
    )


def _origin(url: str) -> str | None:
    """scheme://host:port in lower case, or None for anything that is not a
    plain http(s) address (other schemes, user:password@, no host)."""
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        return None
    scheme = parts.scheme.lower()
    if scheme not in ("http", "https") or not parts.hostname or "@" in parts.netloc:
        return None
    port = port or (443 if scheme == "https" else 80)
    return f"{scheme}://{parts.hostname.lower()}:{port}"


def allowed_origins() -> set[str]:
    raw = [configured_url(), *os.environ.get("INTEGRATION_PLATFORM_ALLOWED_URLS", "").split(",")]
    return {o for o in (_origin(api_base(r)) for r in raw if r.strip()) if o}


def resolve(url: str | None) -> str:
    """The API base URL to call for what was given: empty means the
    installation's own platform. Raises PlatformAddressError when the address
    is not allowed."""
    value = (url or "").strip().rstrip("/") or configured_url()
    if not value:
        raise PlatformAddressError(
            "Ange Integrationsplattformens adress – INTEGRATION_PLATFORM_URL är inte satt"
        )
    origin = _origin(value)
    if origin is None or origin not in allowed_origins():
        raise PlatformAddressError(
            "Adressen är inte en tillåten integrationsplattform för den här installationen "
            "(INTEGRATION_PLATFORM_URL eller INTEGRATION_PLATFORM_ALLOWED_URLS)"
        )
    return value


def is_installation_platform(url: str) -> bool:
    """Whether the address is the installation's own platform (same origin)."""
    own = configured_url()
    return bool(own) and _origin(url) is not None and _origin(url) == _origin(own)


def key_for(url: str, own_key: str) -> str:
    """The key to send to `url`: the profile's own, or the installation's key –
    but that one only to the installation's own platform."""
    if own_key:
        return own_key
    return installation_key() if is_installation_platform(url) else ""
