"""Egna fält på inbyggda objekttyper och på kopplingar.

Kontraktet som låses här:
- En administratör lägger fält (kort text eller ett av några val) på en
  objekttyp eller en kopplingstyp; nyckeln börjar alltid med x_.
- Värdena fylls i av den som får ändra objektet respektive kopplingen, prövas
  mot fältets definition och ligger i attributen.
- Ett tomt värde tar bort fältets värde.
- Synken, och ett formulär som bara kan sina egna fält, skriver inte över dem.
- Utan inställning finns inga egna fält.
"""
import uuid

import pytest
import pytest_asyncio

from app.auth import issue_local_token
from app.domain_lists import keep_own, parse
from app.schemas.common import ExternalSource, NodeType
from app.schemas.node import NodeCreate
from app.services import org_settings

URL = "/api/v1/org-settings/domain-lists"
INTEGRATIONSTYP = {
    "key": "x_integrationstyp", "label": "Integrationstyp", "type": "choice",
    "options": ["REST", "SOAP", "Filöverföring"],
}
KOMMENTAR = {"key": "x_avtal", "label": "Avtal", "type": "text"}


@pytest_asyncio.fixture
async def api_headers(repo):
    admin = await repo.create_local_user(
        name="Admin", email=f"admin-{uuid.uuid4().hex}@example.org", password_hash="x", role="admin",
    )
    return {"Authorization": f"Bearer {issue_local_token(admin)}"}


@pytest_asyncio.fixture(autouse=True)
async def rena_listor(repo):
    await org_settings.set_domain_lists(repo._session_factory, None, "test")
    yield
    await org_settings.set_domain_lists(repo._session_factory, None, "test")


async def _spara(client, api_headers, **extra):
    return await client.put(
        URL, json={"disabled": [], "custom": [], "extra_fields": {"nodes": {}, "edges": {}, **extra}},
        headers=api_headers,
    )


async def _integration(client, api_headers):
    ids = []
    for namn in ("A", "B"):
        resp = await client.post(
            "/api/v1/nodes", json={"type": "Application", "name": f"Egna fält {namn} {uuid.uuid4().hex[:6]}"},
            headers=api_headers,
        )
        assert resp.status_code == 201, resp.text
        ids.append(resp.json()["id"])
    resp = await client.post(
        "/api/v1/edges", json={"source_id": ids[0], "target_id": ids[1], "type": "INTEGRATES_WITH"},
        headers=api_headers,
    )
    assert resp.status_code == 201, resp.text
    return ids, resp.json()["id"]


@pytest.mark.asyncio
async def test_falt_pa_en_koppling_sparas_bredvid_riktningen(client, api_headers):
    assert (await _spara(client, api_headers, edges={"INTEGRATES_WITH": [INTEGRATIONSTYP, KOMMENTAR]})).status_code == 200
    _, edge_id = await _integration(client, api_headers)

    resp = await client.patch(
        f"/api/v1/edges/{edge_id}/fields",
        json={"values": {"x_integrationstyp": "REST", "x_avtal": "  Ramavtal 12  "}}, headers=api_headers,
    )
    assert resp.status_code == 200, resp.text
    attrs = resp.json()["attributes"]
    assert attrs["x_integrationstyp"] == "REST"
    assert attrs["x_avtal"] == "Ramavtal 12"
    assert attrs["direction"] == "BIDIRECTIONAL"

    # Riktningen och anteckningen rör inte de egna fälten – och tvärtom.
    await client.patch(f"/api/v1/edges/{edge_id}/direction", json={"direction": "SOURCE_TO_TARGET"}, headers=api_headers)
    attrs = (await client.patch(f"/api/v1/edges/{edge_id}/note", json={"note": "Nattlig"}, headers=api_headers)).json()["attributes"]
    assert attrs == {
        "direction": "SOURCE_TO_TARGET", "note": "Nattlig", "x_integrationstyp": "REST", "x_avtal": "Ramavtal 12",
    }


@pytest.mark.asyncio
async def test_ett_tomt_varde_tar_bort_faltets_varde(client, api_headers):
    await _spara(client, api_headers, edges={"INTEGRATES_WITH": [INTEGRATIONSTYP]})
    _, edge_id = await _integration(client, api_headers)
    url = f"/api/v1/edges/{edge_id}/fields"
    await client.patch(url, json={"values": {"x_integrationstyp": "SOAP"}}, headers=api_headers)
    for tomt in ("", "   ", None):
        await client.patch(url, json={"values": {"x_integrationstyp": "SOAP"}}, headers=api_headers)
        resp = await client.patch(url, json={"values": {"x_integrationstyp": tomt}}, headers=api_headers)
        assert "x_integrationstyp" not in resp.json()["attributes"]


@pytest.mark.asyncio
async def test_bara_definierade_falt_och_erbjudna_val_tas_emot(client, api_headers):
    await _spara(client, api_headers, edges={"INTEGRATES_WITH": [INTEGRATIONSTYP]})
    (app_id, _), edge_id = await _integration(client, api_headers)
    url = f"/api/v1/edges/{edge_id}/fields"
    for values in ({"x_integrationstyp": "Röksignaler"}, {"x_okant": "x"}, {"direction": "SOURCE_TO_TARGET"}, {"x_integrationstyp": "x" * 501}):
        resp = await client.patch(url, json={"values": values}, headers=api_headers)
        assert resp.status_code == 422, values
    # Fältet hör till kopplingstypen, inte till applikationen.
    resp = await client.patch(f"/api/v1/nodes/{app_id}/fields", json={"values": {"x_integrationstyp": "REST"}}, headers=api_headers)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_falt_pa_ett_objekt_overlever_formular_och_synk(client, repo, api_headers):
    await _spara(client, api_headers, nodes={"Application": [KOMMENTAR]})
    ext_id = f"egna-{uuid.uuid4()}"
    data = NodeCreate(
        type=NodeType.APPLICATION, name=f"Synkad {uuid.uuid4().hex[:6]}",
        external_source=ExternalSource.SHAREPOINT, external_id=ext_id, attributes={"leverantor": "Acme"},
    )
    node, _ = await repo.upsert_node_by_external("SHAREPOINT", ext_id, data)

    resp = await client.patch(f"/api/v1/nodes/{node.id}/fields", json={"values": {"x_avtal": "Dnr 7"}}, headers=api_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["attributes"] == {"leverantor": "Acme", "x_avtal": "Dnr 7"}

    # Synken byter källans attribut men lämnar det egna fältet.
    await repo.upsert_node_by_external(
        "SHAREPOINT", ext_id, data.model_copy(update={"attributes": {"leverantor": "Nya Acme"}}),
    )
    assert (await repo.get_node(node.id)).attributes == {"leverantor": "Nya Acme", "x_avtal": "Dnr 7"}

    # Ett formulär som bara skickar sina egna attribut gör det också.
    resp = await client.patch(f"/api/v1/nodes/{node.id}", json={"attributes": {"leverantor": "Tredje"}}, headers=api_headers)
    assert resp.json()["attributes"] == {"leverantor": "Tredje", "x_avtal": "Dnr 7"}

    # En synk som inte ändrar något lämnar ingen ny rad i historiken.
    fore = await repo.get_node(node.id)
    await repo.upsert_node_by_external(
        "SHAREPOINT", ext_id, data.model_copy(update={"attributes": {"leverantor": "Tredje"}}),
    )
    assert (await repo.get_node(node.id)).updated_at == fore.updated_at


@pytest.mark.asyncio
async def test_definitionerna_provas(client, api_headers):
    def fel(**extra):
        return _spara(client, api_headers, **extra)

    # Nyckeln måste börja med x_ – annars kunde ett fält ta över riktningen.
    assert (await fel(edges={"INTEGRATES_WITH": [{**INTEGRATIONSTYP, "key": "direction"}]})).status_code == 422
    assert (await fel(edges={"KRAMAR": [INTEGRATIONSTYP]})).status_code == 422
    assert (await fel(nodes={"Robot": [KOMMENTAR]})).status_code == 422
    # En egen lista har sina fält i sin egen definition.
    assert (await fel(nodes={"CustomObject": [KOMMENTAR]})).status_code == 422
    assert (await fel(edges={"INTEGRATES_WITH": [{**INTEGRATIONSTYP, "options": []}]})).status_code == 422
    assert (await fel(edges={"INTEGRATES_WITH": [KOMMENTAR, KOMMENTAR]})).status_code == 422
    assert (await fel(edges={"INTEGRATES_WITH": [{**KOMMENTAR, "type": "date"}]})).status_code == 422

    resp = await fel(edges={"INTEGRATES_WITH": [INTEGRATIONSTYP], "USES": []})
    assert resp.status_code == 200, resp.text
    # En typ utan fält sparas inte, och alla ser definitionerna.
    publik = (await client.get("/api/v1/org-settings/public")).json()["domain_lists"]["extra_fields"]
    assert publik == {"nodes": {}, "edges": {"INTEGRATES_WITH": [INTEGRATIONSTYP]}}


@pytest.mark.asyncio
async def test_en_installning_fran_fore_egna_falt_lases_som_forut():
    assert parse({"disabled": ["Server"], "custom": []}).extra_fields.edges == {}


def test_keep_own_slapper_ett_varde_bara_nar_nyckeln_namns():
    gamla = {"leverantor": "Acme", "x_avtal": "Dnr 7", "x_typ": "REST"}
    assert keep_own(gamla, {"leverantor": "Ny"}) == {"leverantor": "Ny", "x_avtal": "Dnr 7", "x_typ": "REST"}
    assert keep_own(gamla, {"x_typ": "SOAP"}) == {"x_avtal": "Dnr 7", "x_typ": "SOAP"}
    assert keep_own(None, {"a": 1}) == {"a": 1}
