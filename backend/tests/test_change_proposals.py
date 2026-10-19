"""Ändringsförslag på domänobjekt – vem som helst föreslår, admin släcker.

Kontraktet som låses här:
- Vilken roll som helst (även "user", som inte får redigera) kan föreslå en
  ändring med pennan.
- Förslaget skriver ALDRIG till noden: värdet som visas är fortfarande det
  bakomliggande listan levererat. Gränssnittet stryker över det aktuella
  värdet och visar förslaget ovanför, så länge förslaget är öppet.
- Förslaget hamnar i admininkorgen och i ändringsloggen.
- När admin släcker förslaget försvinner det ur nodens öppna förslag (och
  därmed överstrykningen), men raden och loggen finns kvar.
"""
from uuid import UUID

import pytest
from sqlalchemy import select

from app.auth import issue_local_token
from app.models.audit import AuditLogORM


async def _app(client, api_headers, namn: str, status: str = "I drift") -> str:
    resp = await client.post(
        "/api/v1/nodes",
        json={"type": "Application", "name": namn, "attributes": {"status": status}},
        headers=api_headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _vanlig_anvandare(repo, epost: str) -> dict:
    user = await repo.create_local_user(name="Förslag Fredriksson", email=epost, password_hash="x", role="user")
    return {"Authorization": f"Bearer {issue_local_token(user)}"}


@pytest.mark.asyncio
async def test_vanlig_anvandare_kan_foresla_och_admin_slacker(client, api_headers, repo):
    node_id = await _app(client, api_headers, "2C8 – förslagstest")
    anv = await _vanlig_anvandare(repo, "forslag.fredriksson@example.org")

    skapa = await client.post(
        f"/api/v1/nodes/{node_id}/change-proposals",
        json={"changes": [{"field": "attributes.status", "new_value": "Under avveckling"}],
              "comment": "Beslutat i förvaltningsgruppen"},
        headers=anv,
    )
    assert skapa.status_code == 201, skapa.text
    forslag = skapa.json()[0]
    assert forslag["old_value"] == "I drift"
    assert forslag["current_value"] == "I drift"
    assert forslag["new_value"] == "Under avveckling"
    assert forslag["proposed_by"] == "Förslag Fredriksson"

    # Noden är orörd – det är listan som äger värdet.
    nod = await client.get(f"/api/v1/nodes/{node_id}", headers=api_headers)
    assert nod.json()["attributes"]["status"] == "I drift"

    # Öppet förslag syns på noden (överstrykningen) …
    oppna = await client.get(f"/api/v1/nodes/{node_id}/change-proposals", headers=anv)
    assert [p["id"] for p in oppna.json()] == [forslag["id"]]

    # … och i admininkorgen.
    inkorg = await client.get("/api/v1/admin/notifications", headers=api_headers)
    assert forslag["id"] in [p["id"] for p in inkorg.json()["change_proposals"]]

    # En vanlig användare får inte släcka.
    nej = await client.post(
        f"/api/v1/change-proposals/{forslag['id']}/resolve", json={"outcome": "done"}, headers=anv
    )
    assert nej.status_code == 403

    slack = await client.post(
        f"/api/v1/change-proposals/{forslag['id']}/resolve",
        json={"outcome": "done", "note": "Ändrat i SharePoint-listan"},
        headers=api_headers,
    )
    assert slack.status_code == 200 and slack.json()["status"] == "done"

    # Överstrykningen är borta, inkorgen tom på det här förslaget.
    assert (await client.get(f"/api/v1/nodes/{node_id}/change-proposals", headers=anv)).json() == []
    inkorg = await client.get("/api/v1/admin/notifications", headers=api_headers)
    assert forslag["id"] not in [p["id"] for p in inkorg.json()["change_proposals"]]

    # Går inte att släcka två gånger.
    igen = await client.post(
        f"/api/v1/change-proposals/{forslag['id']}/resolve", json={"outcome": "done"}, headers=api_headers
    )
    assert igen.status_code == 409

    # Loggen bär både förslaget och släckningen.
    async with repo._session_factory() as s:
        handelser = (
            await s.execute(
                select(AuditLogORM.action, AuditLogORM.user_name, AuditLogORM.change_note)
                .where(AuditLogORM.entity_id == UUID(node_id), AuditLogORM.action.like("PROPOSE%"))
                .order_by(AuditLogORM.created_at)
            )
        ).all()
    assert [h.action for h in handelser] == ["PROPOSE", "PROPOSE_DONE"]
    assert handelser[0].user_name == "Förslag Fredriksson"
    assert handelser[0].change_note == "Beslutat i förvaltningsgruppen"
    assert handelser[1].change_note == "Ändrat i SharePoint-listan"


@pytest.mark.asyncio
async def test_forslag_som_inte_andrar_nagot_avvisas(client, api_headers):
    node_id = await _app(client, api_headers, "Oförändrad – förslagstest")
    resp = await client.post(
        f"/api/v1/nodes/{node_id}/change-proposals",
        json={"changes": [{"field": "attributes.status", "new_value": " I drift "}]},
        headers=api_headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_okant_falt_avvisas(client, api_headers):
    node_id = await _app(client, api_headers, "Okänt fält – förslagstest")
    for falt in ("type", "attributes.", "attributes.parent_id", "external_id"):
        resp = await client.post(
            f"/api/v1/nodes/{node_id}/change-proposals",
            json={"changes": [{"field": falt, "new_value": "x"}]},
            headers=api_headers,
        )
        assert resp.status_code == 422, falt


@pytest.mark.asyncio
async def test_bara_forslagsstallaren_kan_dra_tillbaka(client, api_headers, repo):
    node_id = await _app(client, api_headers, "Tillbakadragning – förslagstest")
    agare = await _vanlig_anvandare(repo, "agare.forslag@example.org")
    annan = await _vanlig_anvandare(repo, "annan.forslag@example.org")
    skapa = await client.post(
        f"/api/v1/nodes/{node_id}/change-proposals",
        json={"changes": [{"field": "description", "new_value": "Ny beskrivning"}]},
        headers=agare,
    )
    pid = skapa.json()[0]["id"]

    assert (await client.delete(f"/api/v1/change-proposals/{pid}", headers=annan)).status_code == 403
    assert (await client.delete(f"/api/v1/change-proposals/{pid}", headers=agare)).status_code == 204
    assert (await client.get(f"/api/v1/nodes/{node_id}/change-proposals", headers=agare)).json() == []


@pytest.mark.asyncio
async def test_listan_visar_redan_foreslaget_varde(client, api_headers):
    """När synken läst in det föreslagna värdet ser admin det i current_value."""
    node_id = await _app(client, api_headers, "Redan ändrad – förslagstest")
    skapa = await client.post(
        f"/api/v1/nodes/{node_id}/change-proposals",
        json={"changes": [{"field": "attributes.status", "new_value": "Avvecklat"}]},
        headers=api_headers,
    )
    pid = skapa.json()[0]["id"]
    await client.patch(
        f"/api/v1/nodes/{node_id}", json={"attributes": {"status": "Avvecklat"}}, headers=api_headers
    )
    inkorg = await client.get("/api/v1/admin/notifications", headers=api_headers)
    p = next(x for x in inkorg.json()["change_proposals"] if x["id"] == pid)
    assert p["current_value"] == "Avvecklat" and p["old_value"] == "I drift"
