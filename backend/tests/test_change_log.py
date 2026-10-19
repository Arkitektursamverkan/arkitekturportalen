"""Förändringsloggen – ändringar i IT-miljön, loggade från verksamhetskalendern.

Kontraktet som låses här:
- Alla inloggade läser; bara administratörer och de som katalogen placerar i
  IT- och Informationsarkitektur skriver.
- En förändring som krockar med en fastställd verksamhetspost avvisas tills
  man aktivt valt att genomföra den ändå; valet och vem som gjorde det sparas.
- Förslag i kalendern krockar inte – bara fastställda poster.
- En förändring kopplas bara till applikationer och teknikkomponenter.
"""
import pytest
from sqlalchemy import delete

from app.auth import issue_local_token
from app.config import settings
from app.models.calendar_event import CalendarEventORM
from app.models.directory import DirectoryPersonORM

FORANDRING = {
    "title": "Uppgradering av Momentum",
    "starts_at": "2026-11-02T10:00:00",
    "ends_at": "2026-11-02T12:00:00",
    "affected_share": "25to50",
    "user_impact": "medium",
    "change_type": "normal",
    "description": "Ny version",
    "impact": "Momentum nere under uppgraderingen",
    "risks": "Återställning tar en timme",
    "notify_departments": ["Enhet Kundcenter", " Enhet Kundcenter ", "HR"],
    "approval_status": "approved",
    "approved_by": "IT-chefen",
}


async def _anvandare(repo, namn: str, epost: str, avdelning: str | None = None) -> dict:
    user = await repo.create_local_user(name=namn, email=epost, password_hash="x", role="user")
    if avdelning:
        async with repo._session_factory() as s:
            s.add(DirectoryPersonORM(entra_oid=f"oid-{epost}", name=namn, email=epost, department=avdelning))
            await s.commit()
    return {"Authorization": f"Bearer {issue_local_token(user)}"}


@pytest.fixture(autouse=True)
def _arkitekturavdelning(monkeypatch):
    """Vilken avdelning som skriver är en inställning per installation."""
    monkeypatch.setattr(settings, "CHANGE_LOG_DEPARTMENTS", "IT- och Informationsarkitektur")


@pytest.fixture(autouse=True)
async def _tom_kalender(repo):
    """Krockarna räknas mot hela kalendern, och andra testfiler lämnar kvar
    poster (t.ex. ett veckovis återkommande Årsbokslut) i den delade databasen."""
    async with repo._session_factory() as s:
        await s.execute(delete(CalendarEventORM))
        await s.commit()


async def _nod(client, api_headers, typ: str, namn: str) -> str:
    resp = await client.post("/api/v1/nodes", json={"type": typ, "name": namn, "attributes": {}}, headers=api_headers)
    assert resp.status_code == 201
    return resp.json()["id"]


@pytest.mark.asyncio
async def test_bara_arkitektur_och_admin_skriver(client, api_headers, repo):
    arkitekt = await _anvandare(repo, "Arne Arkitekt", "arne.arkitekt@example.org", "IT- och Informationsarkitektur")
    annan = await _anvandare(repo, "Kim Kundcenter", "kim.kundcenter@example.org", "Enhet Kundcenter")
    utanfor = await _anvandare(repo, "Ulla Utanför", "ulla.utanfor@example.org")
    # En tid utan verksamhetsposter.
    lugn = {**FORANDRING, "starts_at": "2031-03-12T02:00:00", "ends_at": "2031-03-12T03:00:00"}

    async def far(headers):
        return (await client.get("/api/v1/change-log/permissions", headers=headers)).json()["can_manage"]

    assert await far(arkitekt) and await far(api_headers)
    assert not await far(annan) and not await far(utanfor)

    for nekad in (annan, utanfor):
        assert (await client.post("/api/v1/change-log/entries", json=lugn, headers=nekad)).status_code == 403

    skapad = await client.post("/api/v1/change-log/entries", json=lugn, headers=arkitekt)
    assert skapad.status_code == 201, skapad.text
    post = skapad.json()
    assert post["created_by"] == "Arne Arkitekt"
    assert post["notify_departments"] == ["Enhet Kundcenter", "HR"]
    assert post["conflicts"] == [] and post["conflict_override"] is False

    # Alla läser, men bara de behöriga ändrar och tar bort.
    url = f"/api/v1/change-log/entries/{post['id']}"
    period = {"from": "2031-03-12", "to": "2031-03-12"}
    assert post["id"] in [e["id"] for e in (await client.get("/api/v1/change-log/entries", params=period, headers=utanfor)).json()]
    utanfor_period = {"from": "2031-03-13", "to": "2031-03-20"}
    assert post["id"] not in [e["id"] for e in (await client.get("/api/v1/change-log/entries", params=utanfor_period, headers=utanfor)).json()]
    assert (await client.put(url, json=lugn, headers=annan)).status_code == 403
    assert (await client.delete(url, headers=annan)).status_code == 403
    andrad = await client.put(url, json={**lugn, "approval_status": "rejected"}, headers=api_headers)
    assert andrad.status_code == 200 and andrad.json()["approval_status"] == "rejected"
    assert (await client.delete(url, headers=arkitekt)).status_code == 204

    async with repo._session_factory() as s:
        await s.execute(delete(DirectoryPersonORM))
        await s.commit()


@pytest.mark.asyncio
async def test_krock_med_verksamhetspost_kraver_aktivt_val(client, api_headers, repo):
    momentum = await _nod(client, api_headers, "Application", "Momentum – krocktest")
    process = await _nod(client, api_headers, "Process", "Uthyrning – krocktest")
    post = {
        "title": "Nyckelutlämning krocktest", "recurrence": "monthly_first_workday", "start_date": "2026-01-01",
        "start_time": "08:00", "end_time": "17:00", "change_freeze": True, "node_ids": [momentum],
    }
    # Ett förslag krockar inte – bara fastställda poster.
    anv = await _anvandare(repo, "Fia Förslag", "fia.forslag@example.org")
    forslag = (await client.post("/api/v1/calendar/events", json=post, headers=anv)).json()
    kontroll = {"starts_at": FORANDRING["starts_at"], "ends_at": FORANDRING["ends_at"], "node_ids": [momentum]}

    async def krockar():
        svar = await client.post("/api/v1/change-log/conflicts", json=kontroll, headers=anv)
        return [k for k in svar.json() if k["event_id"] == forslag["id"]]

    assert await krockar() == []
    await client.post(f"/api/v1/calendar/events/{forslag['id']}/resolve", json={"outcome": "approved"}, headers=api_headers)

    # Första vardagen i november 2026 är måndagen den 2:a.
    krock = await krockar()
    assert len(krock) == 1
    assert krock[0]["start_date"] == "2026-11-02" and krock[0]["change_freeze"] is True
    assert krock[0]["shared_nodes"] == ["Momentum – krocktest"]

    # Precis efter att händelsen slutat, eller dagen efter: ingen krock.
    for tid in ("2026-11-02T17:00:00", "2026-11-03T10:00:00", "2026-11-02T07:59:00"):
        svar = await client.post("/api/v1/change-log/conflicts", json={"starts_at": tid}, headers=anv)
        assert forslag["id"] not in [k["event_id"] for k in svar.json()], tid
    # En tidpunkt mitt i händelsen krockar även utan sluttid.
    svar = await client.post("/api/v1/change-log/conflicts", json={"starts_at": "2026-11-02T08:00:00"}, headers=anv)
    assert forslag["id"] in [k["event_id"] for k in svar.json()]

    data = {**FORANDRING, "node_ids": [momentum]}
    nekad = await client.post("/api/v1/change-log/entries", json=data, headers=api_headers)
    assert nekad.status_code == 409 and "Nyckelutlämning krocktest" in nekad.json()["detail"]

    genomford = await client.post("/api/v1/change-log/entries", json={**data, "conflict_override": True}, headers=api_headers)
    assert genomford.status_code == 201, genomford.text
    logg = genomford.json()
    assert logg["conflict_override"] is True and logg["conflict_override_by"] == "System"
    assert [k["title"] for k in logg["conflicts"] if k["event_id"] == forslag["id"]] == ["Nyckelutlämning krocktest"]

    # Flyttas förändringen till en tid utan verksamhetsposter släcks valet.
    flyttad = await client.put(
        f"/api/v1/change-log/entries/{logg['id']}",
        json={**data, "starts_at": "2031-03-12T02:00:00", "ends_at": "2031-03-12T03:00:00"},
        headers=api_headers,
    )
    assert flyttad.status_code == 200
    assert flyttad.json()["conflict_override"] is False and flyttad.json()["conflict_override_by"] is None

    # Bara applikationer och teknikkomponenter går att koppla.
    fel = await client.post(
        "/api/v1/change-log/entries",
        json={**flyttad.json(), "node_ids": [process], "starts_at": "2031-03-12T02:00:00", "ends_at": None},
        headers=api_headers,
    )
    assert fel.status_code == 422

    await client.delete(f"/api/v1/calendar/events/{forslag['id']}", headers=api_headers)


@pytest.mark.asyncio
async def test_ogiltiga_forandringar_avvisas(client, api_headers):
    async def skapa(**andring):
        data = {**FORANDRING, "starts_at": "2031-03-12T02:00:00", "ends_at": "2031-03-12T03:00:00", **andring}
        return (await client.post("/api/v1/change-log/entries", json=data, headers=api_headers)).status_code

    assert await skapa(ends_at="2031-03-12T01:00:00") == 422
    assert await skapa(affected_share="100") == 422
    assert await skapa(user_impact="enorm") == 422
    assert await skapa(change_type="brådskande") == 422
    assert await skapa(title=" ") == 422
