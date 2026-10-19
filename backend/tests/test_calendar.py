"""Verksamhetskalendern – vem som helst föreslår, redaktör fastställer.

Kontraktet som låses här:
- Upprepningsreglerna, särskilt "första vardagen i månaden" som hoppar över
  helger och svenska helgdagar.
- Vilken roll som helst kan föreslå en post; den syns för alla som förslag
  och hamnar i admininkorgen tills en redaktör fastställer eller avslår.
- Den som föreslagit kan ändra och dra tillbaka sitt förslag tills det är
  hanterat – ingen annan vanlig användare kan det.
- En redaktörs egen post är fastställd direkt.
"""
from datetime import date

import pytest

from app.auth import issue_local_token
from app.services.calendar_recurrence import is_workday, occurrences


def test_forsta_vardagen_hoppar_over_helg_och_helgdag():
    d = occurrences("monthly_first_workday", date(2026, 1, 1), None, date(2026, 1, 1), date(2027, 1, 31))
    assert d[0] == date(2026, 1, 2)     # nyårsdagen är en torsdag
    assert d[1] == date(2026, 2, 2)     # 1 februari är en söndag
    assert d[4] == date(2026, 5, 4)     # första maj en fredag, sedan helg
    assert d[12] == date(2027, 1, 4)    # nyårsdagen en fredag, sedan helg
    assert len(d) == 13 and all(is_workday(x) for x in d)


def test_sista_vardagen_hoppar_over_nyarsafton():
    assert occurrences("monthly_last_workday", date(2026, 1, 1), None, date(2026, 12, 1), date(2026, 12, 31)) == [
        date(2026, 12, 30)
    ]


def test_rorliga_helgdagar_ar_inte_vardagar():
    assert not is_workday(date(2026, 4, 3))    # långfredagen
    assert not is_workday(date(2026, 4, 6))    # annandag påsk
    assert not is_workday(date(2026, 5, 14))   # Kristi himmelsfärdsdag
    assert not is_workday(date(2026, 6, 19))   # midsommarafton
    assert is_workday(date(2026, 4, 7))


def test_ovriga_upprepningsregler():
    y = (date(2026, 1, 1), date(2026, 12, 31))
    assert occurrences("once", date(2026, 3, 10), None, *y) == [date(2026, 3, 10)]
    assert occurrences("once", date(2025, 3, 10), None, *y) == []
    # Varje tisdag, med slutdatum.
    assert occurrences("weekly", date(2026, 3, 10), date(2026, 3, 24), *y) == [
        date(2026, 3, 10), date(2026, 3, 17), date(2026, 3, 24)
    ]
    # Den 31:a faller på månadens sista dag i kortare månader.
    assert occurrences("monthly_day", date(2026, 1, 31), None, *y)[:3] == [
        date(2026, 1, 31), date(2026, 2, 28), date(2026, 3, 31)
    ]
    # Andra tisdagen varje månad.
    assert occurrences("monthly_nth_weekday", date(2026, 3, 10), None, *y)[:3] == [
        date(2026, 3, 10), date(2026, 4, 14), date(2026, 5, 12)
    ]
    # Femte måndagen läses som sista måndagen.
    assert occurrences("monthly_nth_weekday", date(2026, 3, 30), None, *y)[:2] == [
        date(2026, 3, 30), date(2026, 4, 27)
    ]
    assert occurrences("yearly", date(2024, 2, 29), None, date(2026, 1, 1), date(2028, 12, 31)) == [
        date(2026, 2, 28), date(2027, 2, 28), date(2028, 2, 29)
    ]
    # Inget före första datumet.
    assert occurrences("weekly", date(2026, 3, 10), None, date(2026, 3, 1), date(2026, 3, 9)) == []


async def _anvandare(repo, namn: str, epost: str) -> dict:
    user = await repo.create_local_user(name=namn, email=epost, password_hash="x", role="user")
    return {"Authorization": f"Bearer {issue_local_token(user)}"}


async def _app(client, api_headers, namn: str) -> str:
    resp = await client.post(
        "/api/v1/nodes", json={"type": "Application", "name": namn, "attributes": {}}, headers=api_headers
    )
    assert resp.status_code == 201
    return resp.json()["id"]


NYCKELUTLAMNING = {
    "title": "Nyckelutlämning",
    "description": "Nya hyresgäster hämtar nycklar",
    "recurrence": "monthly_first_workday",
    "start_date": "2026-01-01",
    "start_time": "08:00",
    "end_time": "17:00",
    "change_freeze": True,
    "other_dependencies": "Internet, skrivare",
}


@pytest.mark.asyncio
async def test_anvandare_foreslar_och_redaktor_faststaller(client, api_headers, repo):
    momentum = await _app(client, api_headers, "Momentum – kalendertest")
    anv = await _anvandare(repo, "Kalle Kalender", "kalle.kalender@example.org")
    annan = await _anvandare(repo, "Anna Annan", "anna.annan@example.org")

    skapa = await client.post(
        "/api/v1/calendar/events", json={**NYCKELUTLAMNING, "node_ids": [momentum]}, headers=anv
    )
    assert skapa.status_code == 201, skapa.text
    post = skapa.json()
    assert post["status"] == "proposed"
    assert post["proposed_by"] == "Kalle Kalender"
    assert [n["name"] for n in post["nodes"]] == ["Momentum – kalendertest"]

    # Förslaget syns för alla, med sina datum i perioden …
    lista = await client.get(
        "/api/v1/calendar/events", params={"from": "2026-01-01", "to": "2026-02-28"}, headers=annan
    )
    min_post = next(e for e in lista.json() if e["id"] == post["id"])
    assert min_post["occurrences"] == ["2026-01-02", "2026-02-02"]

    # … på objektet det beror på …
    pa_objekt = await client.get("/api/v1/calendar/events", params={"node_id": momentum}, headers=annan)
    assert [e["id"] for e in pa_objekt.json()] == [post["id"]]

    # … och i admininkorgen.
    inkorg = await client.get("/api/v1/admin/notifications", headers=api_headers)
    assert post["id"] in [e["id"] for e in inkorg.json()["calendar_proposals"]]

    # Den som föreslagit kan ändra; en annan vanlig användare kan varken ändra,
    # dra tillbaka eller fastställa.
    andra = await client.put(
        f"/api/v1/calendar/events/{post['id']}",
        json={**NYCKELUTLAMNING, "end_time": "16:00", "node_ids": [momentum]},
        headers=anv,
    )
    assert andra.status_code == 200 and andra.json()["end_time"] == "16:00:00"
    url = f"/api/v1/calendar/events/{post['id']}"
    assert (await client.put(url, json=NYCKELUTLAMNING, headers=annan)).status_code == 403
    assert (await client.delete(url, headers=annan)).status_code == 403
    assert (await client.post(f"{url}/resolve", json={"outcome": "approved"}, headers=anv)).status_code == 403

    faststall = await client.post(f"{url}/resolve", json={"outcome": "approved"}, headers=api_headers)
    assert faststall.status_code == 200 and faststall.json()["status"] == "approved"
    inkorg = await client.get("/api/v1/admin/notifications", headers=api_headers)
    assert post["id"] not in [e["id"] for e in inkorg.json()["calendar_proposals"]]

    # Fastställd: den som föreslog kan inte längre ändra eller ta bort,
    # och posten kan inte hanteras två gånger.
    assert (await client.put(url, json=NYCKELUTLAMNING, headers=anv)).status_code == 403
    assert (await client.delete(url, headers=anv)).status_code == 403
    assert (await client.post(f"{url}/resolve", json={"outcome": "rejected"}, headers=api_headers)).status_code == 409

    # Redaktören tar bort posten ur kalendern.
    assert (await client.delete(url, headers=api_headers)).status_code == 204
    lista = await client.get("/api/v1/calendar/events", headers=anv)
    assert post["id"] not in [e["id"] for e in lista.json()]


@pytest.mark.asyncio
async def test_forslag_kan_dras_tillbaka_och_avslas(client, api_headers, repo):
    anv = await _anvandare(repo, "Tilda Tillbaka", "tilda.tillbaka@example.org")

    forsta = (await client.post("/api/v1/calendar/events", json=NYCKELUTLAMNING, headers=anv)).json()
    assert (await client.delete(f"/api/v1/calendar/events/{forsta['id']}", headers=anv)).status_code == 204

    andra = (await client.post("/api/v1/calendar/events", json=NYCKELUTLAMNING, headers=anv)).json()
    avslag = await client.post(
        f"/api/v1/calendar/events/{andra['id']}/resolve",
        json={"outcome": "rejected", "note": "Finns redan"},
        headers=api_headers,
    )
    assert avslag.json()["status"] == "rejected"

    synliga = [e["id"] for e in (await client.get("/api/v1/calendar/events", headers=anv)).json()]
    assert forsta["id"] not in synliga and andra["id"] not in synliga


@pytest.mark.asyncio
async def test_redaktorens_post_ar_faststalld_direkt(client, api_headers):
    resp = await client.post("/api/v1/calendar/events", json={**NYCKELUTLAMNING, "title": "Bokslut"}, headers=api_headers)
    assert resp.status_code == 201 and resp.json()["status"] == "approved"


@pytest.mark.asyncio
async def test_ogiltiga_poster_avvisas(client, api_headers):
    async def skapa(**andring):
        return (await client.post("/api/v1/calendar/events", json={**NYCKELUTLAMNING, **andring}, headers=api_headers)).status_code

    assert await skapa(end_time="07:00") == 422                       # slut före start
    assert await skapa(end_time=None) == 422                          # bara starttid
    assert await skapa(end_date="2025-12-31") == 422                  # slutdatum före start
    assert await skapa(recurrence="varannan vecka") == 422
    assert await skapa(node_ids=["00000000-0000-0000-0000-000000000000"]) == 422
    for q in ({"from": "2026-01-01"}, {"from": "2026-01-01", "to": "2028-01-01"}):
        assert (await client.get("/api/v1/calendar/events", params=q, headers=api_headers)).status_code == 422


@pytest.mark.asyncio
async def test_berord_avdelning_sparas_pa_posten(client, api_headers):
    resp = await client.post(
        "/api/v1/calendar/events",
        json={**NYCKELUTLAMNING, "title": "Avdelningstest", "departments": [" Kundcenter ", "Kundcenter", "", "Förvaltning"]},
        headers=api_headers,
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["departments"] == ["Kundcenter", "Förvaltning"]


@pytest.mark.asyncio
async def test_flerdagshandelse_syns_i_perioder_den_stracker_sig_in_i(client, api_headers):
    bokslut = {
        "title": "Årsbokslut", "recurrence": "once", "start_date": "2026-12-28", "duration_days": 12,
        "start_time": "08:00", "end_time": "07:00",  # sluttid sista dagen får ligga före starttiden
    }
    resp = await client.post("/api/v1/calendar/events", json=bokslut, headers=api_headers)
    assert resp.status_code == 201, resp.text
    post = resp.json()
    assert post["duration_days"] == 12

    async def start_i(period):
        lista = await client.get("/api/v1/calendar/events", params=period, headers=api_headers)
        return next(e for e in lista.json() if e["id"] == post["id"])["occurrences"]

    # Började i december men pågår in i januari (t.o.m. 8 januari).
    assert await start_i({"from": "2027-01-01", "to": "2027-01-31"}) == ["2026-12-28"]
    assert await start_i({"from": "2027-01-08", "to": "2027-01-08"}) == ["2026-12-28"]
    assert await start_i({"from": "2027-01-09", "to": "2027-01-31"}) == []

    # En endagshändelse måste fortfarande sluta efter att den börjat, och en
    # återkommande får inte vara längre än tiden till nästa tillfälle.
    kort = {**bokslut, "duration_days": 1}
    assert (await client.post("/api/v1/calendar/events", json=kort, headers=api_headers)).status_code == 422
    vecka = {**bokslut, "recurrence": "weekly", "duration_days": 8}
    assert (await client.post("/api/v1/calendar/events", json=vecka, headers=api_headers)).status_code == 422
    assert (await client.post("/api/v1/calendar/events", json={**vecka, "duration_days": 3}, headers=api_headers)).status_code == 201
