"""Behörighet per roll, grupp och objekt – tilldelningar.

Kontraktet som låses här:
- En tilldelning till en grupp gäller gruppens medlemmar, inte andra.
- En tilldelning på en process med underprocesser gäller hela grenen – men
  bara den grenen; utan underprocesser gäller den bara processen själv.
- En förvaltare av en gren får skapa underprocesser i den men inte flytta
  en process till en gren hen inte förvaltar.
- En tilldelning på en enskild server gör just den servern synlig, inget mer.
- En roll är ett paket rättigheter: ändras paketet ändras allas åtkomst.
- Bidragsgivare laddar upp och skriver, men redigerar inte objektet.
- En inbyggd roll och en roll i användning går inte att ta bort; tas en
  grupp bort försvinner dess tilldelningar.
- "Vem har åtkomst?" och "Kontrollera åtkomst" förklarar varifrån
  behörigheten kommer; bara admin och objektets förvaltare ser den första.
- Utan inloggning gäller det som alla inloggade får – bara läsa.
"""
import pytest

from app.auth import issue_local_token
from app.config import settings


async def _anvandare(repo, epost: str, roll: str = "user"):
    user = await repo.create_local_user(name=epost.split("@")[0], email=epost, password_hash="x", role=roll)
    return user, {"Authorization": f"Bearer {issue_local_token(user)}"}


async def _nod(client, api_headers, typ: str, namn: str, **attr) -> str:
    resp = await client.post("/api/v1/nodes", json={"type": typ, "name": namn, "attributes": attr}, headers=api_headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _roller(client, api_headers) -> dict[str, str]:
    return {r["key"]: r["id"] for r in (await client.get("/api/v1/access/roles", headers=api_headers)).json()}


async def _tilldela(client, api_headers, **falt) -> dict:
    resp = await client.post("/api/v1/access/grants", json=falt, headers=api_headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _grupp(client, api_headers, namn: str, *medlemmar) -> str:
    resp = await client.post(
        "/api/v1/access/groups", json={"name": namn, "member_ids": [str(m.id) for m in medlemmar]}, headers=api_headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _behorighet(client, headers, node_id: str) -> dict:
    return (await client.get(f"/api/v1/nodes/{node_id}/permissions", headers=headers)).json()


@pytest.mark.asyncio
async def test_grupp_forvaltar_processgren_med_underprocesser(client, api_headers, repo):
    roller = await _roller(client, api_headers)
    drift = await _nod(client, api_headers, "Process", "4.4 Drift – gren")
    akut = await _nod(client, api_headers, "Process", "4.4.2 Akut driftstörning – gren", parent_id=drift)
    annan = await _nod(client, api_headers, "Process", "5 Ekonomi – gren")
    medlem, medlem_h = await _anvandare(repo, "gren.medlem@example.org")
    _, utanfor_h = await _anvandare(repo, "gren.utanfor@example.org")

    grupp = await _grupp(client, api_headers, "Driftledning", medlem)
    await _tilldela(client, api_headers, principal_type="group", group_id=grupp, role_id=roller["forvaltare"],
                    scope_type="node", node_id=drift, include_children=True)

    # Medlemmen förvaltar hela grenen, men inget annat.
    for nod in (drift, akut):
        assert (await _behorighet(client, medlem_h, nod))["edit_object"] is True
    assert (await _behorighet(client, medlem_h, annan))["edit_object"] is False
    assert (await _behorighet(client, utanfor_h, akut))["edit_object"] is False
    assert (await client.patch(f"/api/v1/nodes/{akut}", json={"name": "4.4.2 Akut – nytt namn"}, headers=medlem_h)).status_code == 200
    assert (await client.patch(f"/api/v1/nodes/{annan}", json={"name": "Smyg"}, headers=medlem_h)).status_code == 403

    # Får skapa en underprocess i grenen, men inte en process högst upp.
    ny = await client.post("/api/v1/nodes", json={"type": "Process", "name": "4.4.3 Ny", "attributes": {"parent_id": drift}}, headers=medlem_h)
    assert ny.status_code == 201, ny.text
    assert (await _behorighet(client, medlem_h, ny.json()["id"]))["edit_object"] is True
    assert (await client.post("/api/v1/nodes", json={"type": "Process", "name": "Rotprocess"}, headers=medlem_h)).status_code == 403

    # …och får inte flytta en process till en gren hen inte förvaltar.
    flytt = await client.patch(f"/api/v1/nodes/{akut}", json={"attributes": {"parent_id": annan}}, headers=medlem_h)
    assert flytt.status_code == 403


@pytest.mark.asyncio
async def test_utan_underprocesser_galler_tilldelningen_bara_processen(client, api_headers, repo):
    roller = await _roller(client, api_headers)
    topp = await _nod(client, api_headers, "Process", "6 Topp – ensam")
    under = await _nod(client, api_headers, "Process", "6.1 Under – ensam", parent_id=topp)
    user, h = await _anvandare(repo, "ensam.forvaltare@example.org")
    await _tilldela(client, api_headers, principal_type="user", user_id=str(user.id), role_id=roller["forvaltare"],
                    scope_type="node", node_id=topp)

    assert (await _behorighet(client, h, topp))["edit_object"] is True
    assert (await _behorighet(client, h, under))["edit_object"] is False


@pytest.mark.asyncio
async def test_tilldelning_pa_en_server_visar_bara_den(client, api_headers, repo):
    roller = await _roller(client, api_headers)
    synlig = await _nod(client, api_headers, "Server", "Filserver – synlig")
    dold = await _nod(client, api_headers, "Server", "Filserver – dold")
    user, h = await _anvandare(repo, "en.server@example.org")
    await _tilldela(client, api_headers, principal_type="user", user_id=str(user.id), role_id=roller["lasare"],
                    scope_type="node", node_id=synlig)

    servrar = {n["id"] for n in (await client.get("/api/v1/nodes", params={"node_type": "Server"}, headers=h)).json()}
    assert synlig in servrar and dold not in servrar
    assert (await client.get(f"/api/v1/nodes/{dold}", headers=h)).status_code == 404
    # Sidan Servrar erbjuds, eftersom det finns något att visa där.
    me = (await client.get("/api/v1/users/me", headers=h)).json()
    assert me["access"] == {"servers": "read"}
    assert me["type_access"]["Server"] == "none"


@pytest.mark.asyncio
async def test_bidragsgivare_skriver_men_redigerar_inte_objektet(client, api_headers, repo):
    roller = await _roller(client, api_headers)
    app_id = await _nod(client, api_headers, "Application", "Hyressystemet – bidrag")
    user, h = await _anvandare(repo, "bidrag@example.org")
    await _tilldela(client, api_headers, principal_type="user", user_id=str(user.id), role_id=roller["bidragsgivare"],
                    scope_type="node", node_id=app_id)

    b = await _behorighet(client, h, app_id)
    assert (b["write_documents"], b["write_notes"], b["edit_object"], b["read_restricted"]) == (True, True, False, False)
    assert (await client.post(f"/api/v1/nodes/{app_id}/notes", json={"body": "Hej"}, headers=h)).status_code == 201
    assert (await client.patch(f"/api/v1/nodes/{app_id}", json={"name": "Nytt"}, headers=h)).status_code == 403


@pytest.mark.asyncio
async def test_andrad_roll_andrar_allas_atkomst(client, api_headers, repo):
    app_id = await _nod(client, api_headers, "Application", "Ekonomisystemet – roll")
    _, h = await _anvandare(repo, "roll.lasare@example.org")
    roll = await client.post(
        "/api/v1/access/roles",
        json={"name": "Antecknare", "permissions": ["notes.read", "notes.write"]},
        headers=api_headers,
    )
    assert roll.status_code == 201, roll.text
    assert roll.json()["key"] == "antecknare"
    await _tilldela(client, api_headers, principal_type="everyone", role_id=roll.json()["id"],
                    scope_type="node", node_id=app_id)
    assert (await _behorighet(client, h, app_id))["write_notes"] is True

    await client.patch(f"/api/v1/access/roles/{roll.json()['id']}", json={"permissions": ["notes.read"]}, headers=api_headers)
    assert (await _behorighet(client, h, app_id))["write_notes"] is False

    # I användning – går inte att ta bort; inbyggd – går aldrig att ta bort.
    assert (await client.delete(f"/api/v1/access/roles/{roll.json()['id']}", headers=api_headers)).status_code == 409
    lasare = (await _roller(client, api_headers))["lasare"]
    assert (await client.delete(f"/api/v1/access/roles/{lasare}", headers=api_headers)).status_code == 400
    assert (await client.post("/api/v1/access/roles", json={"name": "X", "permissions": ["allt"]}, headers=api_headers)).status_code == 422


@pytest.mark.asyncio
async def test_borttagen_grupp_tar_med_sig_tilldelningarna(client, api_headers, repo):
    roller = await _roller(client, api_headers)
    server = await _nod(client, api_headers, "Server", "Larmserver – grupp")
    medlem, h = await _anvandare(repo, "grupp.medlem@example.org")
    grupp = await _grupp(client, api_headers, "Serverteamet", medlem)
    await _tilldela(client, api_headers, principal_type="group", group_id=grupp, role_id=roller["forvaltare"],
                    scope_type="types", node_types=["Server"])
    assert (await client.get(f"/api/v1/nodes/{server}", headers=h)).status_code == 200

    # Ut ur gruppen – ingen åtkomst; in igen och sedan bort med gruppen – ingen åtkomst.
    await client.put(f"/api/v1/access/groups/{grupp}/members", json={"user_ids": []}, headers=api_headers)
    assert (await client.get(f"/api/v1/nodes/{server}", headers=h)).status_code == 404
    await client.put(f"/api/v1/access/groups/{grupp}/members", json={"user_ids": [str(medlem.id)]}, headers=api_headers)
    assert (await client.get(f"/api/v1/nodes/{server}", headers=h)).status_code == 200
    assert (await client.delete(f"/api/v1/access/groups/{grupp}", headers=api_headers)).status_code == 204
    assert (await client.get(f"/api/v1/nodes/{server}", headers=h)).status_code == 404
    assert all(g["group_id"] != grupp for g in (await client.get("/api/v1/access/grants", headers=api_headers)).json())


@pytest.mark.asyncio
async def test_vem_har_atkomst_och_kontrollera(client, api_headers, repo):
    roller = await _roller(client, api_headers)
    drift = await _nod(client, api_headers, "Process", "4.4 Drift – förklara")
    akut = await _nod(client, api_headers, "Process", "4.4.2 Akut – förklara", parent_id=drift)
    medlem, medlem_h = await _anvandare(repo, "forklara.medlem@example.org")
    _, lasare_h = await _anvandare(repo, "forklara.lasare@example.org")
    grupp = await _grupp(client, api_headers, "Driftledning – förklara", medlem)
    await _tilldela(client, api_headers, principal_type="group", group_id=grupp, role_id=roller["forvaltare"],
                    scope_type="node", node_id=drift, include_children=True)

    # En vanlig läsare får inte se vem som har åtkomst; förvaltaren får det.
    assert (await client.get(f"/api/v1/access/nodes/{akut}", headers=lasare_h)).status_code == 403
    vem = await client.get(f"/api/v1/access/nodes/{akut}", headers=medlem_h)
    assert vem.status_code == 200, vem.text
    via = {(g["grant"]["principal_type"], g["via"]) for g in vem.json()["grants"]}
    assert ("group", "inherited") in via and ("everyone", "type") in via and ("role", "type") in via
    arvd = next(g for g in vem.json()["grants"] if g["via"] == "inherited")
    assert arvd["inherited_from_id"] == drift and arvd["grant"]["principal_name"] == "Driftledning – förklara"

    kontroll = (await client.get(
        "/api/v1/access/check", params={"user_id": str(medlem.id), "node_id": akut}, headers=api_headers,
    )).json()
    assert kontroll["groups"] == ["Driftledning – förklara"]
    assert "object.edit" in kontroll["permissions"]
    assert {g["via"] for g in kontroll["grants"]} == {"type", "inherited"}


@pytest.mark.asyncio
async def test_utan_inloggning_bara_lasa(client, api_headers, monkeypatch):
    # Läsning utan inloggning måste vara påslagen i installationen.
    monkeypatch.setattr(settings, "ANONYMOUS_READ", True)
    app_id = await _nod(client, api_headers, "Application", "Öppna systemet – anonym")
    server = await _nod(client, api_headers, "Server", "Dold server – anonym")
    assert (await client.get(f"/api/v1/nodes/{app_id}")).status_code == 200
    assert (await client.get(f"/api/v1/nodes/{server}")).status_code == 404
    assert (await client.get("/api/v1/access/grants")).status_code == 401


@pytest.mark.asyncio
async def test_ogiltiga_tilldelningar_avvisas(client, api_headers, repo):
    roller = await _roller(client, api_headers)
    app_id = await _nod(client, api_headers, "Application", "System – ogiltig")
    fel = [
        {"principal_type": "role", "principal_role": "admin", "role_id": roller["lasare"], "scope_type": "all"},
        {"principal_type": "group", "role_id": roller["lasare"], "scope_type": "all"},
        {"principal_type": "everyone", "role_id": roller["lasare"], "scope_type": "types", "node_types": ["Bil"]},
        {"principal_type": "everyone", "role_id": roller["lasare"], "scope_type": "node"},
    ]
    for f in fel:
        assert (await client.post("/api/v1/access/grants", json=f, headers=api_headers)).status_code == 422, f
    # Underprocesser finns bara för processer.
    resp = await client.post("/api/v1/access/grants", json={
        "principal_type": "everyone", "role_id": roller["lasare"], "scope_type": "node",
        "node_id": app_id, "include_children": True,
    }, headers=api_headers)
    assert resp.status_code == 400
    # Bara admin hanterar tilldelningar.
    _, redaktor = await _anvandare(repo, "ogiltig.redaktor@example.org", roll="superuser")
    assert (await client.get("/api/v1/access/grants", headers=redaktor)).status_code == 403
