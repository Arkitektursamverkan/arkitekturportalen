"""Listor per installation: stänga av inbyggda listor och lägga till egna.

Kontraktet som låses här:
- En avstängd lista döljs för alla, administratörer också, men objekten finns kvar
  och kommer tillbaka när listan slås på.
- Kopplingar till ett dolt objekt döljs, i både listor och grafen.
- Applikationer, processer och informationsobjekt går inte att stänga av.
- En egen lista med objekt går inte att ta bort, och en nyckel går inte att byta.
- Synk fortsätter skriva till en avstängd lista och rör inte andra listors objekt.
- Utan inställning är allt som förut.
"""
import uuid
from uuid import UUID

import pytest
import pytest_asyncio

from app.api.v1 import sync as sync_api
from app.auth import issue_local_token
from app.domain_lists import parse, sync_target
from app.schemas.common import NodeType
from app.schemas.edge import EdgeCreate
from app.schemas.node import NodeCreate
from app.services import org_settings

URL = "/api/v1/org-settings/domain-lists"
LEVERANTORER = {
    "key": "leverantorer", "name": "Leverantörer", "domain": "application",
    "fields": [{"key": "avtal", "label": "Avtal", "type": "link"}],
}


@pytest_asyncio.fixture
async def api_headers(repo):
    """En inloggad administratör. Nyckeln i X-Api-Key är systemanvändaren, som synken kör som."""
    admin = await repo.create_local_user(
        name="Admin", email=f"admin-{uuid.uuid4().hex}@example.org", password_hash="x", role="admin",
    )
    return {"Authorization": f"Bearer {issue_local_token(admin)}"}


@pytest_asyncio.fixture(autouse=True)
async def rena_listor(repo):
    await org_settings.set_domain_lists(repo._session_factory, None, "test")
    yield
    await org_settings.set_domain_lists(repo._session_factory, None, "test")


async def _spara(client, api_headers, **data):
    return await client.put(URL, json={"disabled": [], "custom": [], **data}, headers=api_headers)


async def _ids(client, api_headers, typ=None) -> set[str]:
    params = {"node_type": typ} if typ else {}
    resp = await client.get("/api/v1/nodes", params={**params, "limit": 10_000}, headers=api_headers)
    assert resp.status_code == 200, resp.text
    return {n["id"] for n in resp.json()}


@pytest.mark.asyncio
async def test_systemanvandaren_ser_avstangda_listor(client, repo, api_headers):
    server = await repo.create_node(NodeCreate(type=NodeType.SERVER, name="Syns för synken"))
    await _spara(client, api_headers, disabled=["Server"])
    system = {"X-Api-Key": "test-key"}
    assert str(server.id) in await _ids(client, system)


@pytest.mark.asyncio
async def test_utan_installning_ar_allt_som_forut(client):
    assert org_settings.domain_lists() is None
    resp = await client.get("/api/v1/org-settings/public")
    assert resp.json()["domain_lists"] == {
        "disabled": [], "custom": [], "extra_fields": {"nodes": {}, "edges": {}},
    }


@pytest.mark.asyncio
async def test_avstangd_lista_doljs_for_admin_och_kommer_tillbaka(client, api_headers, repo):
    server = await repo.create_node(NodeCreate(type=NodeType.SERVER, name="Dold server"))
    app = await repo.create_node(NodeCreate(type=NodeType.APPLICATION, name="Kvar"))
    edge = await repo.create_edge(EdgeCreate(source_id=app.id, target_id=server.id, type="RUNS_ON"))
    assert (await _spara(client, api_headers, disabled=["Server"])).status_code == 200

    assert str(server.id) not in await _ids(client, api_headers)
    assert str(app.id) in await _ids(client, api_headers)
    assert (await client.get(f"/api/v1/nodes/{server.id}", headers=api_headers)).status_code == 404
    edges = (await client.get("/api/v1/edges", headers=api_headers)).json()
    assert str(edge.id) not in {e["id"] for e in edges}
    # Går inte heller att skapa fler där.
    ny = await client.post("/api/v1/nodes", json={"type": "Server", "name": "Ny"}, headers=api_headers)
    assert ny.status_code == 403

    await _spara(client, api_headers)
    assert str(server.id) in await _ids(client, api_headers)
    edges = (await client.get("/api/v1/edges", headers=api_headers)).json()
    assert str(edge.id) in {e["id"] for e in edges}


@pytest.mark.asyncio
@pytest.mark.parametrize("typ", ["Application", "Process", "InformationObject", "Okand"])
async def test_rapporternas_grund_gar_inte_att_stanga_av(client, api_headers, typ):
    assert (await _spara(client, api_headers, disabled=[typ])).status_code == 422


@pytest.mark.asyncio
async def test_servrar_och_servertjanster_stangs_av_var_for_sig(client, api_headers, repo):
    server = await repo.create_node(NodeCreate(type=NodeType.SERVER, name="S1"))
    tjanst = await repo.create_node(NodeCreate(type=NodeType.SERVER_SERVICE, name="DNS"))
    await _spara(client, api_headers, disabled=["ServerService"])
    synliga = await _ids(client, api_headers)
    assert str(server.id) in synliga and str(tjanst.id) not in synliga


@pytest.mark.asyncio
async def test_egen_lista_objekt_syns_for_lasare_och_doljs_nar_den_stangs_av(client, api_headers, repo):
    await _spara(client, api_headers, custom=[LEVERANTORER])
    resp = await client.post(
        "/api/v1/nodes",
        json={"type": "CustomObject", "name": "Lev AB", "attributes": {"list_key": "leverantorer", "avtal": "https://x"}},
        headers=api_headers,
    )
    assert resp.status_code == 201, resp.text
    obj = resp.json()["id"]
    assert obj in await _ids(client, api_headers, "CustomObject")

    await _spara(client, api_headers, custom=[{**LEVERANTORER, "active": False}])
    assert obj not in await _ids(client, api_headers)
    nekad = await client.post(
        "/api/v1/nodes",
        json={"type": "CustomObject", "name": "Till", "attributes": {"list_key": "leverantorer"}},
        headers=api_headers,
    )
    assert nekad.status_code == 422

    await _spara(client, api_headers, custom=[LEVERANTORER])
    assert obj in await _ids(client, api_headers)
    await repo.delete_node(UUID(obj))


@pytest.mark.asyncio
async def test_objekt_kraver_en_lista(client, api_headers):
    for attr in ({}, {"list_key": "finns-inte"}):
        resp = await client.post(
            "/api/v1/nodes", json={"type": "CustomObject", "name": "X", "attributes": attr}, headers=api_headers
        )
        assert resp.status_code == 422


@pytest.mark.asyncio
async def test_lista_med_objekt_gar_inte_att_ta_bort_men_tom_gar(client, api_headers, repo):
    await _spara(client, api_headers, custom=[LEVERANTORER])
    assert (await _spara(client, api_headers)).status_code == 200

    await _spara(client, api_headers, custom=[LEVERANTORER])
    await repo.create_node(NodeCreate(
        type=NodeType.CUSTOM_OBJECT, name="Lev", attributes={"list_key": "leverantorer"},
    ))
    assert (await _spara(client, api_headers)).status_code == 409
    assert org_settings.domain_lists()["custom"][0]["key"] == "leverantorer"
    # Städa, så att nästa test kan ta bort listan.
    for n in await repo.list_nodes(node_type="CustomObject", limit=1000):
        await repo.delete_node(n.id)


@pytest.mark.asyncio
async def test_bara_admin_far_andra(client, repo):
    user = await repo.create_local_user(name="vanlig", email=f"vanlig-{uuid.uuid4().hex}@example.org", password_hash="x", role="user")
    headers = {"Authorization": f"Bearer {issue_local_token(user)}"}
    assert (await client.put(URL, json={}, headers=headers)).status_code == 403


@pytest.mark.parametrize("data", [
    {"custom": [LEVERANTORER, {**LEVERANTORER}]},
    {"custom": [{**LEVERANTORER, "key": "Med Mellanslag"}]},
    {"custom": [{**LEVERANTORER, "domain": "annat"}]},
    {"custom": [{**LEVERANTORER, "fields": [{"key": "list_key", "label": "X"}]}]},
])
@pytest.mark.asyncio
async def test_ogiltiga_listor_avvisas(client, api_headers, data):
    assert (await _spara(client, api_headers, **data)).status_code == 422


def test_synkmal():
    assert sync_target("Application") == (NodeType.APPLICATION, None)
    assert sync_target("CustomObject:lev") == (NodeType.CUSTOM_OBJECT, "lev")
    for fel in ("Application:lev", "CustomObject:", "Okand"):
        with pytest.raises(ValueError):
            sync_target(fel)


def test_gamla_installningar_laser_nya_falt():
    assert parse(None).disabled == []
    assert parse({"disabled": ["Server"]}).custom == []


@pytest.mark.asyncio
async def test_synk_skriver_till_avstangd_lista_och_ror_inte_andra_listor(client, api_headers, repo, monkeypatch):
    await _spara(client, api_headers, custom=[
        {**LEVERANTORER, "active": False}, {"key": "annan", "name": "Annan", "domain": "technology"},
    ])
    annan = await repo.upsert_node_by_external("REST", "f2:1", NodeCreate(
        type=NodeType.CUSTOM_OBJECT, name="Annans", external_id="f2:1", attributes={"list_key": "annan"},
    ))

    class Svar:
        status_code = 200

        @staticmethod
        def json():
            return {"records": [{"external_id": "1", "data": {"n": "Syncad"}}], "total": 1, "page_size": 500}

    class Klient:
        def __init__(self, **_):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return False

        async def get(self, *_a, **_k):
            return Svar()

    monkeypatch.setattr(sync_api.httpx, "AsyncClient", Klient)
    monkeypatch.setenv("INTEGRATION_PLATFORM_URL", "http://x")
    profil = sync_api.SyncProfile(
        flow_id="f1", node_type="CustomObject:leverantorer", external_source_label="REST",
        platform_url="http://x", platform_api_key="k", mappings=[{"source_field": "n", "target": "name"}],
    )
    res = await sync_api._run_sync(profil, repo)
    assert res["created"] == 1 and res["archived"] == 0

    alla = await repo.list_nodes(node_type="CustomObject", limit=1000)
    assert {n.name: n.attributes["list_key"] for n in alla}["Syncad"] == "leverantorer"
    # En källa utanför ExternalSource får inte välta läsningen.
    assert any(n.name == "Annans" and not n.archived for n in alla), annan
    assert "Syncad" not in {n["name"] for n in (await client.get("/api/v1/nodes", headers=api_headers)).json()}
    for n in alla:
        await repo.delete_node(n.id)
