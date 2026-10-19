"""Katalogen ur Entra ID – personer och avdelningar.

Kontraktet som låses här:
- Bara aktiva medlemskonton i tillåten e-postdomän tas in; gäster och
  avstängda konton hoppas över.
- En synk ersätter kopian: den som slutat försvinner.
- Avdelningslistan kommer ur katalogen när den finns, annars bara ur de namn
  som skrivits på kalenderposter – INTE ur applikationernas Avdelning/enhet,
  som kommer från SharePoint-listan och bär avdelningar som inte finns kvar.
- Ett tomt svar från Entra ID raderar inte den kopia som finns.
- Hämtningen går i den inloggade administratörens namn; en biljett som inte
  är utfärdad för organisationens Entra ID avvisas innan något anrop görs.
"""
import base64
import json

import pytest
from sqlalchemy import delete

from app.auth import issue_local_token
from app.config import settings
from app.models.directory import DirectoryPersonORM
from app.services import entra_directory
from app.services.entra_directory import DirectoryError, DirectoryPerson, _keep

BILJETT = "en-graph-biljett-som-testet-inte-anropar-graph-med"


def test_bara_aktiva_medlemmar_i_ratt_doman():
    bas = {"id": "1", "displayName": "Anna", "mail": "Anna@Example.ORG", "department": " Kundcenter ",
           "accountEnabled": True, "userType": "Member"}
    p = _keep(bas)
    assert p == DirectoryPerson("1", "Anna", "anna@example.org", "Kundcenter")
    assert _keep({**bas, "accountEnabled": False}) is None
    assert _keep({**bas, "userType": "Guest"}) is None
    assert _keep({**bas, "mail": "anna@konsult.se"}) is None
    assert _keep({**bas, "department": None}).department is None
    # Saknas mail används inloggningsnamnet.
    assert _keep({**bas, "mail": None, "userPrincipalName": "anna@example.org"}).email == "anna@example.org"


@pytest.mark.asyncio
async def test_synk_ersatter_kopian_och_ger_avdelningslistan(client, api_headers, repo, monkeypatch):
    async with repo._session_factory() as s:
        await s.execute(delete(DirectoryPersonORM))
        await s.commit()
    user = await repo.create_local_user(name="Vanlig", email="vanlig.katalog@example.org", password_hash="x", role="user")
    anv = {"Authorization": f"Bearer {issue_local_token(user)}"}

    # Utan katalog: bara namn som skrivits på kalenderposter.
    await client.post(
        "/api/v1/nodes",
        json={"type": "Application", "name": "Katalogtest", "attributes": {"avdelning": "Nedlagd avdelning"}},
        headers=api_headers,
    )
    await client.post(
        "/api/v1/calendar/events",
        json={"title": "Katalogtest", "start_date": "2026-01-01", "departments": ["Skriven avdelning"]},
        headers=api_headers,
    )
    fore = (await client.get("/api/v1/directory/departments", headers=anv)).json()
    assert fore["source"] == "register"
    namn = [d["name"] for d in fore["departments"]]
    assert "Skriven avdelning" in namn and "Nedlagd avdelning" not in namn

    personer = [
        DirectoryPerson("a", "Anna", "anna@example.org", "Kundcenter"),
        DirectoryPerson("b", "Bo", "bo@example.org", "Kundcenter"),
        DirectoryPerson("c", "Cia", "cia@example.org", "Förvaltning"),
        DirectoryPerson("d", "Dan", "dan@example.org", None),
    ]

    async def hamta(graph_token):
        assert graph_token == BILJETT
        return personer

    monkeypatch.setattr(entra_directory, "fetch_people", hamta)

    # Bara admin får synka.
    synk = {"graph_token": BILJETT}
    assert (await client.post("/api/v1/directory/sync", json=synk, headers=anv)).status_code == 403
    status = (await client.post("/api/v1/directory/sync", json=synk, headers=api_headers)).json()
    assert (status["people"], status["departments"], status["without_department"]) == (4, 2, 1)

    efter = (await client.get("/api/v1/directory/departments", headers=anv)).json()
    assert efter == {"source": "entra", "departments": [
        {"name": "Förvaltning", "people": 1}, {"name": "Kundcenter", "people": 2},
    ]}

    # Admin döljer en avdelning: den försvinner ur vallistan men står kvar,
    # markerad, i adminlistan – och förblir dold efter nästa hämtning.
    dolj = {"name": "Förvaltning", "hidden": True}
    assert (await client.put("/api/v1/directory/departments/visibility", json=dolj, headers=anv)).status_code == 403
    alla = (await client.put("/api/v1/directory/departments/visibility", json=dolj, headers=api_headers)).json()
    assert alla == [
        {"name": "Förvaltning", "people": 1, "hidden": True},
        {"name": "Kundcenter", "people": 2, "hidden": False},
    ]
    await client.post("/api/v1/directory/sync", json=synk, headers=api_headers)
    synliga = (await client.get("/api/v1/directory/departments", headers=anv)).json()
    assert synliga == {"source": "entra", "departments": [{"name": "Kundcenter", "people": 2}]}
    visa = {"name": "Förvaltning", "hidden": False}
    await client.put("/api/v1/directory/departments/visibility", json=visa, headers=api_headers)
    assert len((await client.get("/api/v1/directory/departments", headers=anv)).json()["departments"]) == 2

    # Cia har slutat – hon och hennes avdelning försvinner.
    personer.pop(2)
    status = (await client.post("/api/v1/directory/sync", json=synk, headers=api_headers)).json()
    assert (status["people"], status["departments"]) == (3, 1)

    # Ett tomt svar behåller kopian och rapporteras som fel.
    personer.clear()
    tomt = await client.post("/api/v1/directory/sync", json=synk, headers=api_headers)
    assert tomt.status_code == 502
    assert (await client.get("/api/v1/directory/status", headers=api_headers)).json()["people"] == 3

    async with repo._session_factory() as s:
        await s.execute(delete(DirectoryPersonORM))
        await s.commit()


def _biljett(tid: str) -> str:
    kropp = base64.urlsafe_b64encode(json.dumps({"tid": tid}).encode()).decode().rstrip("=")
    return f"huvud.{kropp}.signatur"


@pytest.mark.asyncio
async def test_biljett_fran_annan_organisation_avvisas(monkeypatch):
    monkeypatch.setattr(settings, "ENTRA_TENANT_ID", "exempel-tenant")
    monkeypatch.setattr(settings, "ENTRA_CLIENT_ID", "ea-app")
    for biljett in (_biljett("annan-tenant"), "inte-en-biljett-alls-utan-punkter"):
        with pytest.raises(DirectoryError, match="organisationens Entra ID"):
            await entra_directory.fetch_people(biljett)


@pytest.mark.asyncio
async def test_utan_entra_inloggning_ger_tydligt_fel(monkeypatch):
    monkeypatch.setattr(settings, "ENTRA_TENANT_ID", "")
    with pytest.raises(DirectoryError, match="inte konfigurerad"):
        await entra_directory.fetch_people(_biljett("x"))
