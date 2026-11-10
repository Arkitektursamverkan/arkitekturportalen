"""Dokument och Anteckningar på arkitekturobjekt.

Kontraktet som låses här (med standardtilldelningarna):
- Alla inloggade läser objektets dokument och delade anteckningar; den som
  får redigera objektet laddar upp, skriver och hanterar allas poster.
- Ett dokument klassat Begränsad syns inte alls för den som bara får läsa –
  varken i listan eller vid nedladdning.
- En privat anteckning syns bara för sin författare, inte ens för admin.
- En uppladdad fil får nya versioner i stället för att skrivas över.
- Dokument hör bara till sitt eget objekt – en underprocess visar inte förälderns.
- En återställning från backup/snapshot behåller dokument och anteckningar.
- Servrar följer Servrar-behörigheten: utan den finns inget att hämta.
- Inget går att nå utan inloggning.
"""
from uuid import UUID

import pytest

from app.auth import issue_local_token


async def _anvandare(repo, epost: str, roll: str = "user", servrar: str | None = None) -> dict:
    user = await repo.create_local_user(name=epost.split("@")[0], email=epost, password_hash="x", role=roll)
    if servrar:
        roller = {r.key: r.id for r, _ in await repo.access.list_roles()}
        await repo.access.create_grant(
            {"principal_type": "user", "user_id": user.id,
             "role_id": roller["forvaltare" if servrar == "edit" else "lasare"],
             "scope_type": "types", "node_types": ["Server"]},
            "test", "test",
        )
    return {"Authorization": f"Bearer {issue_local_token(user)}"}


async def _nod(client, api_headers, typ: str, namn: str, **attr) -> str:
    resp = await client.post(
        "/api/v1/nodes", json={"type": typ, "name": namn, "attributes": attr}, headers=api_headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _ladda_upp(client, headers, node_id: str, filnamn: str, innehall: bytes = b"%PDF-1.4 prov", **falt):
    return await client.post(
        f"/api/v1/nodes/{node_id}/documents/file",
        files={"file": (filnamn, innehall, "application/pdf")},
        data=falt,
        headers=headers,
    )


@pytest.mark.asyncio
async def test_redaktor_laddar_upp_och_lasare_laser(client, api_headers, repo):
    process = await _nod(client, api_headers, "Process", "3.1.2 Hantera inkommande ärende – dok")
    redaktor = await _anvandare(repo, "dok.redaktor@example.org", roll="superuser")
    lasare = await _anvandare(repo, "dok.lasare@example.org")

    up = await _ladda_upp(client, redaktor, process, "Rutin ärendehantering.pdf", doc_type="rutin")
    assert up.status_code == 201, up.text
    doc = up.json()
    assert doc["title"] == "Rutin ärendehantering.pdf"
    assert doc["current_version"]["version_no"] == 1

    # En läsare ser dokumentet men får inte ladda upp eller ta bort.
    lista = (await client.get(f"/api/v1/nodes/{process}/documents", headers=lasare)).json()
    assert [d["id"] for d in lista["documents"]] == [doc["id"]]
    assert lista["permissions"]["write_documents"] is False
    assert lista["documents"][0]["can_edit"] is False
    dl = await client.get(f"/api/v1/nodes/{process}/documents/{doc['id']}/download", headers=lasare)
    assert dl.status_code == 200
    assert dl.content == b"%PDF-1.4 prov"
    assert dl.headers["content-type"] == "application/pdf"
    assert dl.headers["content-disposition"].startswith("attachment;")
    assert (await _ladda_upp(client, lasare, process, "smyg.pdf")).status_code == 403
    assert (await client.delete(f"/api/v1/nodes/{process}/documents/{doc['id']}", headers=lasare)).status_code == 403

    # Utan inloggning finns inget att hämta.
    assert (await client.get(f"/api/v1/nodes/{process}/documents")).status_code == 401


@pytest.mark.asyncio
async def test_farliga_filtyper_och_lankar_avvisas(client, api_headers, repo):
    app_id = await _nod(client, api_headers, "Application", "Fastighetssystemet – filtyper")
    redaktor = await _anvandare(repo, "filtyp.redaktor@example.org", roll="superuser")

    for namn in ("sida.html", "bild.svg", "program.exe", "utan_andelse"):
        assert (await _ladda_upp(client, redaktor, app_id, namn)).status_code == 415, namn

    ond = await client.post(
        f"/api/v1/nodes/{app_id}/documents/link",
        json={"title": "Klicka", "url": "javascript:alert(1)"},
        headers=redaktor,
    )
    assert ond.status_code == 422
    ok = await client.post(
        f"/api/v1/nodes/{app_id}/documents/link",
        json={"title": "Avtal i SharePoint", "url": "https://contoso.sharepoint.com/avtal", "doc_type": "avtal"},
        headers=redaktor,
    )
    assert ok.status_code == 201, ok.text
    assert ok.json()["kind"] == "link"


@pytest.mark.asyncio
async def test_begransat_dokument_doljs_for_lasare(client, api_headers, repo):
    process = await _nod(client, api_headers, "Process", "Larmkedja – begränsad")
    redaktor = await _anvandare(repo, "begr.redaktor@example.org", roll="superuser")
    lasare = await _anvandare(repo, "begr.lasare@example.org")

    up = await _ladda_upp(client, redaktor, process, "Kontaktlista.pdf", classification="begransad")
    assert up.status_code == 201, up.text
    doc_id = up.json()["id"]

    assert (await client.get(f"/api/v1/nodes/{process}/documents", headers=lasare)).json()["documents"] == []
    assert (await client.get(f"/api/v1/nodes/{process}/documents/{doc_id}/download", headers=lasare)).status_code == 404
    assert [d["id"] for d in (await client.get(f"/api/v1/nodes/{process}/documents", headers=redaktor)).json()["documents"]] == [doc_id]

    # Nedladdning av ett begränsat dokument hamnar i granskningsloggen.
    await client.get(f"/api/v1/nodes/{process}/documents/{doc_id}/download", headers=redaktor)
    logg = (await client.get("/api/v1/audit", params={"entity_type": "document"}, headers=api_headers)).json()
    rader = logg["items"] if isinstance(logg, dict) else logg
    assert any(r["entity_id"] == doc_id and r["action"] == "DOWNLOAD" for r in rader)


@pytest.mark.asyncio
async def test_ny_version_behaller_den_gamla(client, api_headers, repo):
    app_id = await _nod(client, api_headers, "Application", "Ekonomisystemet – versioner")
    redaktor = await _anvandare(repo, "ver.redaktor@example.org", roll="superuser")

    doc = (await _ladda_upp(client, redaktor, app_id, "Instruktion.docx", b"v1")).json()
    ny = await client.post(
        f"/api/v1/nodes/{app_id}/documents/{doc['id']}/versions",
        files={"file": ("Instruktion rev.docx", b"v2", "application/octet-stream")},
        data={"comment": "Uppdaterad efter revision"},
        headers=redaktor,
    )
    assert ny.status_code == 200, ny.text
    assert ny.json()["version_count"] == 2
    assert ny.json()["current_version"]["filename"] == "Instruktion rev.docx"

    base = f"/api/v1/nodes/{app_id}/documents/{doc['id']}"
    assert (await client.get(f"{base}/download", headers=redaktor)).content == b"v2"
    assert (await client.get(f"{base}/download", params={"version": 1}, headers=redaktor)).content == b"v1"
    versioner = (await client.get(f"{base}/versions", headers=redaktor)).json()
    assert [v["version_no"] for v in versioner] == [2, 1]


@pytest.mark.asyncio
async def test_underprocess_visar_bara_sina_egna_dokument(client, api_headers, repo):
    rot = await _nod(client, api_headers, "Process", "3.1 Leverans – eget")
    barn = await _nod(client, api_headers, "Process", "3.1.2 Hantera ärende – eget", parent_id=rot)
    redaktor = await _anvandare(repo, "eget.redaktor@example.org", roll="superuser")

    await _ladda_upp(client, redaktor, rot, "Leveranspolicy.pdf")
    await _ladda_upp(client, redaktor, barn, "Rutin ärende.pdf")

    titlar = [d["title"] for d in (await client.get(f"/api/v1/nodes/{barn}/documents", headers=redaktor)).json()["documents"]]
    assert titlar == ["Rutin ärende.pdf"]


@pytest.mark.asyncio
async def test_privat_anteckning_syns_bara_for_forfattaren(client, api_headers, repo):
    app_id = await _nod(client, api_headers, "Application", "Hyressystemet – anteckningar")
    forfattare = await _anvandare(repo, "ant.forfattare@example.org", roll="superuser")
    kollega = await _anvandare(repo, "ant.kollega@example.org", roll="superuser")
    admin = await _anvandare(repo, "ant.admin@example.org", roll="admin")
    lasare = await _anvandare(repo, "ant.lasare@example.org")

    delad = await client.post(f"/api/v1/nodes/{app_id}/notes", json={"body": "Avtalet löper ut 2027."}, headers=forfattare)
    privat = await client.post(
        f"/api/v1/nodes/{app_id}/notes", json={"body": "Kolla med leverantören.", "visibility": "private"}, headers=forfattare,
    )
    assert delad.status_code == privat.status_code == 201

    def ids(resp):
        return {n["id"] for n in resp.json()["notes"]}

    assert ids(await client.get(f"/api/v1/nodes/{app_id}/notes", headers=forfattare)) == {delad.json()["id"], privat.json()["id"]}
    for andra in (kollega, admin, lasare):
        assert ids(await client.get(f"/api/v1/nodes/{app_id}/notes", headers=andra)) == {delad.json()["id"]}
        url = f"/api/v1/nodes/{app_id}/notes/{privat.json()['id']}"
        assert (await client.delete(url, headers=andra)).status_code == 404

    # En läsare får inte skriva; en redaktör får hantera en delad anteckning
    # men inte göra den privat – det bestämmer bara författaren.
    assert (await client.post(f"/api/v1/nodes/{app_id}/notes", json={"body": "x"}, headers=lasare)).status_code == 403
    delad_url = f"/api/v1/nodes/{app_id}/notes/{delad.json()['id']}"
    assert (await client.patch(delad_url, json={"pinned": True}, headers=kollega)).json()["pinned"] is True
    assert (await client.patch(delad_url, json={"visibility": "private"}, headers=kollega)).status_code == 403

    summering = (await client.get(f"/api/v1/nodes/{app_id}/content-summary", headers=kollega)).json()
    assert summering == {"documents": 0, "notes": 2}


@pytest.mark.asyncio
async def test_server_foljer_servrar_behorigheten(client, api_headers, repo):
    server = await _nod(client, api_headers, "Server", "Filserver – innehåll")
    utan = await _anvandare(repo, "srv.utan@example.org", roll="superuser")
    lasa = await _anvandare(repo, "srv.lasa@example.org", servrar="read")
    redigera = await _anvandare(repo, "srv.redigera@example.org", servrar="edit")

    assert (await client.get(f"/api/v1/nodes/{server}/documents", headers=utan)).status_code == 404
    assert (await client.get(f"/api/v1/nodes/{server}/notes", headers=utan)).status_code == 404
    assert (await _ladda_upp(client, lasa, server, "Driftdokumentation.pdf")).status_code == 403
    assert (await _ladda_upp(client, redigera, server, "Driftdokumentation.pdf")).status_code == 201


@pytest.mark.asyncio
async def test_dokument_och_anteckningar_forsvinner_med_objektet(client, api_headers, repo):
    app_id = await _nod(client, api_headers, "Application", "Gammalt system – raderas")
    redaktor = await _anvandare(repo, "rad.redaktor@example.org", roll="superuser")
    doc = (await _ladda_upp(client, redaktor, app_id, "Avvecklingsplan.pdf")).json()
    await client.post(f"/api/v1/nodes/{app_id}/notes", json={"body": "Avvecklas Q4."}, headers=redaktor)

    resp = await client.request("DELETE", f"/api/v1/nodes/{app_id}", json={"reason": "Avvecklat"}, headers=api_headers)
    assert resp.status_code in (200, 204), resp.text
    assert await repo.node_content.get_document(UUID(doc["id"])) is None


@pytest.mark.asyncio
async def test_aterstallning_behaller_dokument_och_anteckningar(client, api_headers, repo):
    app_id = await _nod(client, api_headers, "Application", "Systemet – återställs")
    redaktor = await _anvandare(repo, "ater.redaktor@example.org", roll="superuser")
    doc = (await _ladda_upp(client, redaktor, app_id, "Systembeskrivning.pdf")).json()
    await client.post(f"/api/v1/nodes/{app_id}/notes", json={"body": "Viktigt."}, headers=redaktor)

    backup = await client.get("/api/v1/backup/export", headers=api_headers)
    assert backup.status_code == 200
    # Ändra namnet efter backupen – återställningen ska ta tillbaka det.
    await client.patch(f"/api/v1/nodes/{app_id}", json={"name": "Omdöpt"}, headers=api_headers)

    resp = await client.post(
        "/api/v1/backup/restore",
        files={"file": ("backup.json", backup.content, "application/json")},
        headers=api_headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["nodes_kept"] >= 1

    nod = (await client.get(f"/api/v1/nodes/{app_id}", headers=redaktor)).json()
    assert nod["name"] == "Systemet – återställs"
    docs = (await client.get(f"/api/v1/nodes/{app_id}/documents", headers=redaktor)).json()["documents"]
    assert [d["id"] for d in docs] == [doc["id"]]
    notes = (await client.get(f"/api/v1/nodes/{app_id}/notes", headers=redaktor)).json()["notes"]
    assert [n["body"] for n in notes] == ["Viktigt."]
