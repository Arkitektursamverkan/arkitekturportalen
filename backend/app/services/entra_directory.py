"""Read people and their departments from Entra ID (Microsoft Graph).

Reads in the name of the admin who asks for it: the browser gets a Graph token
for the signed-in admin (delegated permission User.Read.All, admin consent)
and hands it over with the request. The app holds no secret of its own, so
there is no automatic sync – the copy is as fresh as the last time an admin
pressed the button. The copy in ea_directory_people is replaced on every
sync: people who have left disappear with it.
"""
from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx
import structlog
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert

from app.config import settings
from app.dal.postgres_repository import PostgresRepository
from app.models.directory import DirectoryPersonORM
from app.services import org_settings

log = structlog.get_logger(__name__)

GRAPH_USERS_URL = (
    "https://graph.microsoft.com/v1.0/users"
    "?$select=id,displayName,mail,userPrincipalName,department,accountEnabled,userType&$top=999"
)


class DirectoryError(Exception):
    """The directory could not be read – the message is shown to the admin."""


@dataclass
class DirectoryPerson:
    entra_oid: str
    name: str
    email: str
    department: str | None


def is_configured() -> bool:
    return bool(settings.ENTRA_TENANT_ID and settings.ENTRA_CLIENT_ID)


def _token_tenant(token: str) -> str | None:
    """The tenant a Graph token was issued for (read, not verified – Graph
    verifies the token when it is used)."""
    try:
        payload = token.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        return claims.get("tid")
    except (IndexError, ValueError):
        return None


def _keep(u: dict) -> DirectoryPerson | None:
    """Enabled member accounts in an allowed e-mail domain – no guests, no
    disabled accounts."""
    if not u.get("accountEnabled") or (u.get("userType") or "Member") != "Member":
        return None
    email = (u.get("mail") or u.get("userPrincipalName") or "").strip().lower()
    if not org_settings.email_domain_allowed(email):
        return None
    return DirectoryPerson(
        entra_oid=u["id"],
        name=(u.get("displayName") or email).strip()[:255],
        email=email[:255],
        department=((u.get("department") or "").strip() or None),
    )


async def fetch_people(graph_token: str) -> list[DirectoryPerson]:
    """Read every person with the signed-in admin's own Graph token."""
    if not is_configured():
        raise DirectoryError("Inloggning med Entra ID är inte konfigurerad")
    if _token_tenant(graph_token) != settings.ENTRA_TENANT_ID:
        raise DirectoryError("Behörigheten gäller inte organisationens Entra ID")
    people: list[DirectoryPerson] = []
    headers = {"Authorization": f"Bearer {graph_token}"}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            url: str | None = GRAPH_USERS_URL
            while url:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 401:
                    raise DirectoryError("Entra ID godkände inte behörigheten – logga in på nytt och försök igen")
                if resp.status_code == 403:
                    raise DirectoryError(
                        "Entra ID nekade läsningen – rättigheten User.Read.All (Delegated) saknar administratörsmedgivande"
                    )
                if resp.status_code != 200:
                    raise DirectoryError(f"Microsoft Graph svarade {resp.status_code}")
                body = resp.json()
                people.extend(p for p in map(_keep, body.get("value", [])) if p)
                url = body.get("@odata.nextLink")
    except httpx.HTTPError as e:
        raise DirectoryError(f"Kunde inte nå Entra ID: {e}") from e
    return people


async def sync_directory(repo: PostgresRepository, graph_token: str) -> int:
    """Replace ea_directory_people with what Entra ID holds now."""
    people = await fetch_people(graph_token)
    if not people:
        # An empty answer is far more likely a filter or permission problem
        # than an empty company – keep what we have.
        raise DirectoryError("Entra ID lämnade inga personer – den befintliga kopian behålls")
    now = datetime.now(UTC)
    async with repo._session_factory() as s:
        for p in people:
            row = {
                "entra_oid": p.entra_oid, "name": p.name, "email": p.email,
                "department": p.department, "synced_at": now,
            }
            await s.execute(
                insert(DirectoryPersonORM)
                .values(**row)
                .on_conflict_do_update(index_elements=["entra_oid"], set_=row)
            )
        await s.execute(delete(DirectoryPersonORM).where(DirectoryPersonORM.synced_at < now))
        await s.commit()
    log.info("directory.synced", people=len(people))
    return len(people)


async def department_counts(repo: PostgresRepository) -> list[tuple[str, int]]:
    """Departments in the directory with the number of people in each."""
    async with repo._session_factory() as s:
        rows = (
            await s.execute(
                select(DirectoryPersonORM.department, func.count())
                .where(DirectoryPersonORM.department.is_not(None))
                .group_by(DirectoryPersonORM.department)
                .order_by(DirectoryPersonORM.department)
            )
        ).all()
    return [(name, count) for name, count in rows if name is not None]
