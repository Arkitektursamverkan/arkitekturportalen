"""Organisation settings: the ea_org_settings row, falling back to the environment.

The row, logo included (at most LOGO_MAX_BYTES), is cached in the process
(one API process per installation) and reloaded at startup and after every save, so request-time readers like token
verification stay synchronous. A column left NULL means "use the environment
variable", which is how an installation configured through .env keeps its
behaviour until an admin sets a value."""
from __future__ import annotations

import base64
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app import modules as module_catalog
from app.config import settings
from app.models.org_settings import OrgSettingsORM

FIELDS = (
    "org_name", "org_short_name", "brand_color", "allowed_email_domains", "change_log_departments",
    "anonymous_read", "modules",
)

# modules is a list of module keys; [] (none switched on) differs from None (not set).
Value = str | bool | list[str] | None

LOGO_MAX_BYTES = 512 * 1024

_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
_DOMAIN_RE = re.compile(r"^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")

_stored: dict[str, Any] = {}


class OrgSettingsError(ValueError):
    pass


def _split(value: str) -> list[str]:
    return [p.strip() for p in value.split(",") if p.strip()]


def defaults() -> dict[str, Value]:
    """What each setting is when the row leaves it unset."""
    return {
        "org_name": settings.PDF_ORG_NAME or None,
        "org_short_name": settings.PDF_ORG_NAME or None,
        "brand_color": None,
        "allowed_email_domains": settings.ALLOWED_EMAIL_DOMAINS or None,
        "change_log_departments": settings.CHANGE_LOG_DEPARTMENTS or None,
        "anonymous_read": settings.ANONYMOUS_READ,
        "modules": module_catalog.parse(settings.MODULES),
    }


def stored() -> dict[str, Value]:
    """The values set in the database, None where unset."""
    return {f: _stored.get(f) for f in FIELDS}


def _effective(field: str) -> Any:
    value = _stored.get(field)
    return value if value is not None else defaults()[field]


@dataclass(frozen=True)
class OrgSettings:
    org_name: str | None
    org_short_name: str | None
    brand_color: str | None
    allowed_email_domains: list[str]
    change_log_departments: list[str]
    # Read endpoints answer callers that send no credentials (what the
    # everyone grants allow); otherwise they get 401.
    anonymous_read: bool
    # The optional modules switched on (app.modules).
    modules: frozenset[str]
    has_logo: bool
    updated_at: datetime | None


def current() -> OrgSettings:
    return OrgSettings(
        org_name=_effective("org_name"),
        org_short_name=_effective("org_short_name"),
        brand_color=_effective("brand_color"),
        allowed_email_domains=[d.lower() for d in _split(_effective("allowed_email_domains") or "")],
        change_log_departments=_split(_effective("change_log_departments") or ""),
        anonymous_read=bool(_effective("anonymous_read")),
        modules=frozenset(_effective("modules")),
        has_logo=_stored.get("logo") is not None,
        updated_at=_stored.get("updated_at"),
    )


def email_domain_allowed(email: str) -> bool:
    """Empty list = every domain the identity provider signs in."""
    allowed = current().allowed_email_domains
    return not allowed or email.lower().rsplit("@", 1)[-1] in allowed


def _remember(row: OrgSettingsORM | None) -> None:
    _stored.clear()
    if row is None:
        return
    _stored.update({f: getattr(row, f) for f in FIELDS})
    if row.modules is not None:
        _stored["modules"] = [k for k in module_catalog.KEYS if k in row.modules.split(",")]
    _stored["navigation"] = row.navigation
    _stored["domain_lists"] = row.domain_lists
    _stored["logo"] = (row.logo, row.logo_content_type) if row.logo is not None else None
    _stored["updated_at"] = row.updated_at


async def load(session_factory: async_sessionmaker[AsyncSession]) -> None:
    async with session_factory() as s:
        _remember(await s.get(OrgSettingsORM, 1))


def _clean(field: str, value: Value) -> Value:
    """Validate one value; blank means unset (fall back to the environment)."""
    if field == "modules":
        if value is None:
            return None
        if not isinstance(value, list) or not all(isinstance(k, str) for k in value):
            raise OrgSettingsError("Modulerna ska anges som en lista")
        bad = sorted(set(value) - set(module_catalog.KEYS))
        if bad:
            raise OrgSettingsError(f"Okänd modul: {', '.join(bad)}")
        return [k for k in module_catalog.KEYS if k in value]
    if field == "anonymous_read":
        if value is not None and not isinstance(value, bool):
            raise OrgSettingsError("Läsning utan inloggning ska vara på, av eller standard")
        return value
    if isinstance(value, (bool, list)):
        raise OrgSettingsError(f"{field} ska vara text")
    value = (value or "").strip()
    if not value:
        return None
    if field == "brand_color":
        if not _COLOR_RE.match(value):
            raise OrgSettingsError("Profilfärgen ska anges som #RRGGBB")
        return value.upper()
    if field == "allowed_email_domains":
        domains = [d.lower().lstrip("@") for d in _split(value)]
        bad = [d for d in domains if not _DOMAIN_RE.match(d)]
        if bad:
            raise OrgSettingsError(f"Ogiltig e-postdomän: {', '.join(bad)}")
        return ",".join(dict.fromkeys(domains))
    if field == "change_log_departments":
        return ",".join(dict.fromkeys(_split(value)))
    return value


async def save(
    session_factory: async_sessionmaker[AsyncSession], values: dict[str, Value], updated_by: str | None,
) -> None:
    cleaned = {f: _clean(f, values.get(f)) for f in FIELDS if f in values}
    async with session_factory() as s:
        row = await s.get(OrgSettingsORM, 1)
        if row is None:
            row = OrgSettingsORM(id=1)
            s.add(row)
        for field, value in cleaned.items():
            if field == "modules" and value is not None:
                for key in value:  # type: ignore[union-attr]
                    if reason := module_catalog.unavailable_reason(key):
                        raise OrgSettingsError(reason)
                value = ",".join(value)  # type: ignore[arg-type]
            setattr(row, field, value)
        row.updated_by = updated_by
        await s.commit()
        await s.refresh(row)
        _remember(row)


def _logo_type(data: bytes) -> str:
    """The image type from the bytes themselves, never the client's word for it."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    head = data[:1024].lstrip().lower()
    if head.startswith((b"<?xml", b"<svg")) and b"<svg" in data[:4096].lower():
        return "image/svg+xml"
    raise OrgSettingsError("Logotypen ska vara PNG, JPEG, WebP eller SVG")


async def set_logo(
    session_factory: async_sessionmaker[AsyncSession], data: bytes | None, updated_by: str | None,
) -> None:
    """Store a new logo, or remove it with data=None."""
    content_type = None
    if data is not None:
        if len(data) > LOGO_MAX_BYTES:
            raise OrgSettingsError(f"Logotypen får vara högst {LOGO_MAX_BYTES // 1024} kB")
        content_type = _logo_type(data)
    async with session_factory() as s:
        row = await s.get(OrgSettingsORM, 1)
        if row is None:
            row = OrgSettingsORM(id=1)
            s.add(row)
        row.logo = data
        row.logo_content_type = content_type
        row.updated_by = updated_by
        await s.commit()
        await s.refresh(row)
        _remember(row)


def navigation() -> dict[str, Any] | None:
    """The left menu as an admin arranged it, or None for the standard one."""
    return _stored.get("navigation")


async def set_navigation(
    session_factory: async_sessionmaker[AsyncSession], value: dict[str, Any] | None, updated_by: str | None,
) -> None:
    """Store the menu (validated by the caller), or go back to the standard with None."""
    async with session_factory() as s:
        row = await s.get(OrgSettingsORM, 1)
        if row is None:
            row = OrgSettingsORM(id=1)
            s.add(row)
        row.navigation = value
        row.updated_by = updated_by
        await s.commit()
        await s.refresh(row)
        _remember(row)


def domain_lists() -> dict[str, Any] | None:
    """The lists as an admin set them (app.domain_lists), or None for the built-in ones."""
    return _stored.get("domain_lists")


async def set_domain_lists(
    session_factory: async_sessionmaker[AsyncSession], value: dict[str, Any], updated_by: str
) -> None:
    """Store the lists (validated by the caller)."""
    async with session_factory() as s:
        row = await s.get(OrgSettingsORM, 1)
        if row is None:
            row = OrgSettingsORM(id=1)
            s.add(row)
        row.domain_lists = value
        row.updated_by = updated_by
        await s.commit()
        await s.refresh(row)
        _remember(row)


def logo() -> tuple[bytes, str] | None:
    """The logo and its content type, or None."""
    return _stored.get("logo")


def logo_data_uri() -> str | None:
    """The logo inlined, for documents rendered without a web server (PDF)."""
    cur = logo()
    if cur is None:
        return None
    data, content_type = cur
    return f"data:{content_type};base64,{base64.b64encode(data).decode()}"
