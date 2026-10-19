"""Principer följer behörigheterna precis som /nodes.

Kontraktet som låses här:
- En princip som användaren inte får se saknas i listan och ger 404, som
  samma objekt gör under /nodes.
- Läsare på principtypen ser alla principer men får inte ändra dem.
- Att skapa, ändra och ta bort kräver redigera på typen eller principen –
  rollen Redaktör räcker inte i sig.
"""
import pytest
from sqlalchemy import select

from app.auth import issue_local_token
from app.config import settings
from app.models.access import AccessGrantORM

BODY = {
    "identifier": "AP-T1", "name": "Testprincip", "domain": "Övergripande", "purpose": "Syfte",
    "not": "Inte", "but": "Utan", "means": "Innebär", "status": "Förslag",
}


@pytest.fixture(autouse=True)
async def _inga_standardtilldelningar_for_principer(repo):
    """Migreringen ger alla inloggade Läsare och redaktörer Förvaltare över
    principerna; utan dem prövas tilldelningarna i testerna var för sig."""
    async with repo._session_factory() as s:
        andrade = {}
        for g in (await s.execute(select(AccessGrantORM).where(AccessGrantORM.scope_type == "types"))).scalars():
            if g.principal_type != "user" and "ArchitecturePrinciple" in g.node_types:
                andrade[g.id] = list(g.node_types)
                g.node_types = [t for t in g.node_types if t != "ArchitecturePrinciple"]
        await s.commit()
    yield
    async with repo._session_factory() as s:
        for gid, typer in andrade.items():
            g = await s.get(AccessGrantORM, gid)
            if g is not None:
                g.node_types = typer
        await s.commit()


async def _anvandare(repo, epost: str, roll: str = "user"):
    user = await repo.create_local_user(name=epost.split("@")[0], email=epost, password_hash="x", role=roll)
    return user, {"Authorization": f"Bearer {issue_local_token(user)}"}


async def _roller(client, api_headers) -> dict[str, str]:
    return {r["key"]: r["id"] for r in (await client.get("/api/v1/access/roles", headers=api_headers)).json()}


async def _tilldela(client, api_headers, **falt) -> None:
    resp = await client.post("/api/v1/access/grants", json=falt, headers=api_headers)
    assert resp.status_code == 201, resp.text


async def _princip(client, api_headers, identifier: str) -> str:
    resp = await client.post("/api/v1/principles", json={**BODY, "identifier": identifier}, headers=api_headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _synliga(client, headers) -> set[str]:
    resp = await client.get("/api/v1/principles", headers=headers)
    assert resp.status_code == 200, resp.text
    return {p["id"] for p in resp.json()}


@pytest.mark.asyncio
async def test_bara_principer_man_far_se(client, api_headers, repo):
    roller = await _roller(client, api_headers)
    synlig = await _princip(client, api_headers, "AP-T-SYNLIG")
    dold = await _princip(client, api_headers, "AP-T-DOLD")
    user, h = await _anvandare(repo, "princip.lasare@example.org")
    await _tilldela(client, api_headers, principal_type="user", user_id=str(user.id), role_id=roller["lasare"],
                    scope_type="node", node_id=synlig)

    synliga = await _synliga(client, h)
    assert synlig in synliga and dold not in synliga
    assert (await client.get(f"/api/v1/principles/{synlig}", headers=h)).status_code == 200
    assert (await client.get(f"/api/v1/principles/{dold}", headers=h)).status_code == 404
    # Samma svar som under /nodes.
    assert (await client.get(f"/api/v1/nodes/{dold}", headers=h)).status_code == 404


@pytest.mark.asyncio
async def test_lasare_far_inte_andra(client, api_headers, repo):
    roller = await _roller(client, api_headers)
    pid = await _princip(client, api_headers, "AP-T-LAS")
    user, h = await _anvandare(repo, "princip.las@example.org")
    await _tilldela(client, api_headers, principal_type="user", user_id=str(user.id), role_id=roller["lasare"],
                    scope_type="types", node_types=["ArchitecturePrinciple"])

    assert pid in await _synliga(client, h)
    assert (await client.patch(f"/api/v1/principles/{pid}", json={"name": "Nytt"}, headers=h)).status_code == 403
    assert (await client.delete(f"/api/v1/principles/{pid}", headers=h)).status_code == 403
    assert (await client.post("/api/v1/principles", json={**BODY, "identifier": "AP-T-NY"}, headers=h)).status_code == 403


@pytest.mark.asyncio
async def test_redigera_kommer_fran_tilldelningen_inte_rollen(client, api_headers, repo):
    roller = await _roller(client, api_headers)
    pid = await _princip(client, api_headers, "AP-T-RED")

    # Redaktör utan tilldelning: ser inget och får inte ändra.
    _, redaktor = await _anvandare(repo, "princip.redaktor@example.org", "superuser")
    assert pid not in await _synliga(client, redaktor)
    assert (await client.patch(f"/api/v1/principles/{pid}", json={"name": "X"}, headers=redaktor)).status_code == 404

    # Vanlig användare som förvaltar principtypen: får skapa, ändra och ta bort.
    user, h = await _anvandare(repo, "princip.forvaltare@example.org")
    await _tilldela(client, api_headers, principal_type="user", user_id=str(user.id), role_id=roller["forvaltare"],
                    scope_type="types", node_types=["ArchitecturePrinciple"])
    me = (await client.get("/api/v1/users/me", headers=h)).json()
    assert me["type_access"]["ArchitecturePrinciple"] == "edit"
    resp = await client.patch(f"/api/v1/principles/{pid}", json={"name": "Ändrad"}, headers=h)
    assert resp.status_code == 200 and resp.json()["name"] == "Ändrad"
    ny = await client.post("/api/v1/principles", json={**BODY, "identifier": "AP-T-EGEN"}, headers=h)
    assert ny.status_code == 201
    assert (await client.delete(f"/api/v1/principles/{ny.json()['id']}", headers=h)).status_code == 204


@pytest.mark.asyncio
async def test_utan_inloggning_galler_alla_tilldelningen(client, api_headers, monkeypatch):
    monkeypatch.setattr(settings, "ANONYMOUS_READ", True)
    pid = await _princip(client, api_headers, "AP-T-ANON")
    # Ingen tilldelning till alla når principerna: inget syns.
    assert pid not in await _synliga(client, {})
    assert (await client.get(f"/api/v1/principles/{pid}")).status_code == 404
