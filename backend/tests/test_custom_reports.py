"""Egna rapporter: en installations rapport, inläst som data.

Det som låses: att läsa in en rapport kopplar ingenting, att bara en
administratör ser och beslutar, att "koppla" skapar just den kopplingen och
att besluten överlever en ny inläsning.
"""
import uuid

import pytest

from app.auth import issue_local_token


async def _nod(client, api_headers, typ: str, namn: str) -> str:
    r = await client.post("/api/v1/nodes", json={"type": typ, "name": namn}, headers=api_headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _rapport(client, api_headers, *, admin_only: bool = True):
    märke = uuid.uuid4().hex[:8]
    källa = await _nod(client, api_headers, "InformationSource", f"Källa {märke}")
    objekt = await _nod(client, api_headers, "InformationObject", f"Objekt {märke}")
    annat = await _nod(client, api_headers, "InformationObject", f"Annat {märke}")
    key = f"prov-{märke}"
    rader = [
        {"id": "r1", "source_id": källa, "target_id": objekt, "edge_type": "CONTAINS",
         "grupp": "Informationskällor", "säkerhet": "hög", "motivering": "Nämns i beskrivningen."},
        {"id": "r2", "source_id": källa, "target_id": annat, "edge_type": "CONTAINS",
         "grupp": "Informationskällor", "säkerhet": "låg", "motivering": "Kanske."},
    ]
    r = await client.put(
        f"/api/v1/custom-reports/{key}",
        json={"title": f"Prov {märke}", "description": "Engångsgenomgång", "admin_only": admin_only, "rows": rader},
        headers=api_headers,
    )
    assert r.status_code == 200, r.text
    return key, källa, objekt, annat, rader


async def _vanlig(repo) -> dict:
    user = await repo.create_local_user(
        name="Vanlig Användare", email=f"vanlig-{uuid.uuid4().hex[:6]}@example.org", password_hash="x", role="user",
    )
    return {"Authorization": f"Bearer {issue_local_token(user)}"}


async def _kanter(client, api_headers, källa: str) -> list[dict]:
    r = await client.get(f"/api/v1/edges?source_id={källa}", headers=api_headers)
    return r.json()


@pytest.mark.asyncio
async def test_att_lasa_in_en_rapport_kopplar_ingenting(client, repo, api_headers):
    key, källa, objekt, _annat, _ = await _rapport(client, api_headers)
    assert await _kanter(client, api_headers, källa) == []
    r = await client.get(f"/api/v1/custom-reports/{key}", headers=api_headers)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["antal"] == 2 and d["obeslutade"] == 2 and d["kind"] == "kopplingsforslag"
    rad = d["rows"][0]
    assert rad["source"]["type"] == "InformationSource" and rad["target"]["id"] == objekt
    assert rad["finns"] is False and "beslut" not in rad


@pytest.mark.asyncio
async def test_bara_administratorer_ser_en_rapport_for_administratorer(client, repo, api_headers):
    key, *_ = await _rapport(client, api_headers)
    vanlig = await _vanlig(repo)
    assert (await client.get(f"/api/v1/custom-reports/{key}", headers=vanlig)).status_code == 404
    listan = (await client.get("/api/v1/custom-reports", headers=vanlig)).json()["reports"]
    assert key not in [x["key"] for x in listan]
    admin = (await client.get("/api/v1/custom-reports", headers=api_headers)).json()["reports"]
    assert key in [x["key"] for x in admin]
    # Beslut och inläsning kräver alltid en administratör – även i en öppen rapport.
    öppen, *_ = await _rapport(client, api_headers, admin_only=False)
    assert (await client.get(f"/api/v1/custom-reports/{öppen}", headers=vanlig)).status_code == 200
    nej = await client.post(
        f"/api/v1/custom-reports/{öppen}/beslut", json={"row_ids": ["r1"], "val": "koppla"}, headers=vanlig,
    )
    assert nej.status_code == 403
    assert (await client.put(f"/api/v1/custom-reports/{öppen}", json={"title": "x", "rows": []}, headers=vanlig)).status_code == 403


@pytest.mark.asyncio
async def test_koppla_skapar_just_den_kopplingen_och_avsta_skapar_ingen(client, repo, api_headers):
    key, källa, objekt, annat, _ = await _rapport(client, api_headers)
    r = await client.post(
        f"/api/v1/custom-reports/{key}/beslut", json={"row_ids": ["r1"], "val": "koppla"}, headers=api_headers,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["skapade"] == 1 and d["fel"] == [] and d["obeslutade"] == 1
    r1 = next(x for x in d["rows"] if x["id"] == "r1")
    assert r1["finns"] is True and r1["beslut"]["val"] == "koppla" and r1["beslut"]["edge_id"]
    kanter = await _kanter(client, api_headers, källa)
    assert [(k["target_id"], k["type"]) for k in kanter] == [(objekt, "CONTAINS")]

    await client.post(f"/api/v1/custom-reports/{key}/beslut", json={"row_ids": ["r2"], "val": "avstå"}, headers=api_headers)
    assert len(await _kanter(client, api_headers, källa)) == 1

    # En gång till ger ingen dubblett.
    igen = await client.post(
        f"/api/v1/custom-reports/{key}/beslut", json={"row_ids": ["r1", "r2"], "val": "koppla"}, headers=api_headers,
    )
    assert igen.json()["skapade"] == 1  # bara r2 – r1 fanns redan
    assert {k["target_id"] for k in await _kanter(client, api_headers, källa)} == {objekt, annat}


@pytest.mark.asyncio
async def test_ett_beslut_kan_tas_tillbaka_men_kopplingen_star_kvar(client, repo, api_headers):
    key, källa, *_ = await _rapport(client, api_headers)
    await client.post(f"/api/v1/custom-reports/{key}/beslut", json={"row_ids": ["r1"], "val": "koppla"}, headers=api_headers)
    r = await client.post(f"/api/v1/custom-reports/{key}/beslut", json={"row_ids": ["r1"], "val": None}, headers=api_headers)
    r1 = next(x for x in r.json()["rows"] if x["id"] == "r1")
    assert "beslut" not in r1 and r1["finns"] is True
    assert len(await _kanter(client, api_headers, källa)) == 1


@pytest.mark.asyncio
async def test_besluten_overlever_en_ny_inlasning(client, repo, api_headers):
    key, _källa, _objekt, _annat, rader = await _rapport(client, api_headers)
    await client.post(f"/api/v1/custom-reports/{key}/beslut", json={"row_ids": ["r2"], "val": "avstå"}, headers=api_headers)
    # Samma rapport igen, med ändrad motivering och utan rad r1.
    ny = [{**rader[1], "motivering": "Omformulerad."}]
    r = await client.put(f"/api/v1/custom-reports/{key}", json={"title": "Omläst", "rows": ny}, headers=api_headers)
    assert r.status_code == 200 and r.json()["obeslutade"] == 0
    d = (await client.get(f"/api/v1/custom-reports/{key}", headers=api_headers)).json()
    assert [(x["id"], x["motivering"], x["beslut"]["val"]) for x in d["rows"]] == [("r2", "Omformulerad.", "avstå")]


@pytest.mark.asyncio
async def test_en_rad_vars_objekt_ar_borta_gar_inte_att_koppla(client, repo, api_headers):
    key, _källa, objekt, _annat, _ = await _rapport(client, api_headers)
    bort = await client.request(
        "DELETE", f"/api/v1/nodes/{objekt}", json={"reason": "Prov: objektet tas bort"}, headers=api_headers,
    )
    assert bort.status_code in (200, 204), bort.text
    r = await client.post(
        f"/api/v1/custom-reports/{key}/beslut", json={"row_ids": ["r1", "r2"], "val": "koppla"}, headers=api_headers,
    )
    d = r.json()
    assert [f["id"] for f in d["fel"]] == ["r1"] and d["skapade"] == 1
    r1 = next(x for x in d["rows"] if x["id"] == "r1")
    assert r1["target"] is None and "beslut" not in r1


@pytest.mark.asyncio
async def test_ogiltig_inlasning_avvisas(client, repo, api_headers):
    a = await _nod(client, api_headers, "Application", f"App {uuid.uuid4().hex[:6]}")
    rad = {"id": "r1", "source_id": a, "target_id": a, "edge_type": "CONTAINS"}
    dubbla = await client.put("/api/v1/custom-reports/prov-dubbla", json={"title": "x", "rows": [rad, rad]}, headers=api_headers)
    assert dubbla.status_code == 422
    typ = await client.put(
        "/api/v1/custom-reports/prov-typ", json={"title": "x", "rows": [{**rad, "edge_type": "HITTEPÅ"}]}, headers=api_headers,
    )
    assert typ.status_code == 422
    assert (await client.put("/api/v1/custom-reports/Fel_Nyckel", json={"title": "x", "rows": []}, headers=api_headers)).status_code == 422
    assert (await client.get("/api/v1/custom-reports/finns-inte", headers=api_headers)).status_code == 404


@pytest.mark.asyncio
async def test_radens_egna_falt_foljer_med_nar_kopplingen_skapas(client, repo, api_headers):
    """Raden bär värden för kopplingens egna fält. Det som kopplingstypen har
    ett fält för skrivs på kopplingen; resten lämnas – och inget annat än egna
    fält går att skicka med."""
    from app.services import org_settings

    märke = uuid.uuid4().hex[:8]
    källa = await _nod(client, api_headers, "InformationSource", f"Källa {märke}")
    objekt = await _nod(client, api_headers, "InformationObject", f"Objekt {märke}")
    rad = {"id": "r1", "source_id": källa, "target_id": objekt, "edge_type": "CONTAINS", "motivering": "Nämns i beskrivningen."}
    key = f"prov-{märke}"

    inte_eget = await client.put(
        f"/api/v1/custom-reports/{key}", json={"title": "x", "rows": [{**rad, "fält": {"note": "smyger in"}}]}, headers=api_headers,
    )
    assert inte_eget.status_code == 422

    fält = {"x_beskrivning": "  Nämns i beskrivningen.  ", "x_okant": "finns inte på typen", "x_val": "Inte ett val"}
    r = await client.put(f"/api/v1/custom-reports/{key}", json={"title": "x", "rows": [{**rad, "fält": fält}]}, headers=api_headers)
    assert r.status_code == 200, r.text
    await org_settings.set_domain_lists(repo._session_factory, {"extra_fields": {"edges": {"CONTAINS": [
        {"key": "x_beskrivning", "label": "Beskrivning", "type": "text"},
        {"key": "x_val", "label": "Val", "type": "choice", "options": ["A", "B"]},
    ]}}}, "test")
    try:
        r = await client.post(f"/api/v1/custom-reports/{key}/beslut", json={"row_ids": ["r1"], "val": "koppla"}, headers=api_headers)
        assert r.status_code == 200, r.text
        (kant,) = await _kanter(client, api_headers, källa)
        assert kant["attributes"] == {"x_beskrivning": "Nämns i beskrivningen."}
    finally:
        await org_settings.set_domain_lists(repo._session_factory, None, "test")
