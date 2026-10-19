"""Vänstermenyn som administratören ordnat.

Kontraktet som låses här:
- Utan sparad meny är navigation null och webben visar standardmenyn.
- Administratören sparar och återställer; alla (även utan inloggning) läser.
- Ett block, en grupp och en sida finns bara på ett ställe; sidor är
  sökvägar i portalen.
- Andra organisationsinställningar rör inte menyn.
"""
import pytest
from sqlalchemy import delete

from app.auth import issue_local_token
from app.models.org_settings import OrgSettingsORM
from app.services import org_settings

MENY = {"entries": [
    {"type": "block", "key": "home"},
    {"type": "group", "id": "styrning", "label": "Styrning", "icon": "gavel",
     "items": ["/architecture-principles", "/arkitekturresan"]},
    {"type": "item", "path": "/glossary"},
    {"type": "block", "key": "reports"},
]}


@pytest.fixture(autouse=True)
async def _standardmeny(repo):
    async def rensa():
        async with repo._session_factory() as s:
            await s.execute(delete(OrgSettingsORM))
            await s.commit()
        await org_settings.load(repo._session_factory)

    await rensa()
    yield
    await rensa()


async def _publik(client) -> dict:
    return (await client.get("/api/v1/org-settings/public")).json()


@pytest.mark.asyncio
async def test_spara_lasa_aterstalla(client, api_headers):
    assert (await _publik(client))["navigation"] is None
    resp = await client.put("/api/v1/org-settings/navigation", json=MENY, headers=api_headers)
    assert resp.status_code == 200, resp.text
    nav = (await _publik(client))["navigation"]
    assert nav["entries"][1]["items"] == ["/architecture-principles", "/arkitekturresan"]

    await client.put("/api/v1/org-settings", json={"org_name": "Exempel"}, headers=api_headers)
    assert (await _publik(client))["navigation"] == nav

    assert (await client.delete("/api/v1/org-settings/navigation", headers=api_headers)).status_code == 200
    assert (await _publik(client))["navigation"] is None


@pytest.mark.asyncio
async def test_bara_admin_andrar(client, repo):
    user = await repo.create_local_user(name="r", email="meny.redaktor@example.org", password_hash="x", role="superuser")
    h = {"Authorization": f"Bearer {issue_local_token(user)}"}
    assert (await client.put("/api/v1/org-settings/navigation", json=MENY, headers=h)).status_code == 403
    assert (await client.delete("/api/v1/org-settings/navigation", headers=h)).status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("entries", [
    [{"type": "block", "key": "home"}, {"type": "block", "key": "home"}],
    [{"type": "block", "key": "okand"}],
    [{"type": "item", "path": "/glossary"}, {"type": "group", "id": "g", "label": "G", "items": ["/glossary"]}],
    [{"type": "item", "path": "https://example.org"}],
    [{"type": "item", "path": "//example.org"}],
    [{"type": "group", "id": "g", "label": "A"}, {"type": "group", "id": "g", "label": "B"}],
    [{"type": "group", "id": "g", "label": ""}],
])
async def test_ogiltig_meny_avvisas(client, api_headers, entries):
    resp = await client.put("/api/v1/org-settings/navigation", json={"entries": entries}, headers=api_headers)
    assert resp.status_code == 422
    assert (await _publik(client))["navigation"] is None
