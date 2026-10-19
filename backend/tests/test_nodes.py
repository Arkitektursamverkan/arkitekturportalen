"""Node CRUD tests."""
import pytest


@pytest.mark.asyncio
async def test_create_and_get_node(client, api_headers):
    resp = await client.post(
        "/api/v1/nodes",
        json={"type": "InformationObject", "name": "Test Info Object", "description": "Test"},
        headers=api_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test Info Object"
    node_id = data["id"]

    resp2 = await client.get(f"/api/v1/nodes/{node_id}", headers=api_headers)
    assert resp2.status_code == 200
    assert resp2.json()["id"] == node_id


@pytest.mark.asyncio
async def test_update_node(client, api_headers):
    resp = await client.post(
        "/api/v1/nodes",
        json={"type": "TechnologyComponent", "name": "Old Name"},
        headers=api_headers,
    )
    node_id = resp.json()["id"]

    resp2 = await client.patch(
        f"/api/v1/nodes/{node_id}",
        json={"name": "New Name"},
        headers=api_headers,
    )
    assert resp2.status_code == 200
    assert resp2.json()["name"] == "New Name"


@pytest.mark.asyncio
async def test_delete_node(client, api_headers):
    resp = await client.post(
        "/api/v1/nodes",
        json={"type": "InformationSource", "name": "To Delete"},
        headers=api_headers,
    )
    node_id = resp.json()["id"]

    del_resp = await client.request(
        "DELETE",
        f"/api/v1/nodes/{node_id}",
        json={"reason": "test cleanup"},
        headers=api_headers,
    )
    assert del_resp.status_code == 204

    get_resp = await client.get(f"/api/v1/nodes/{node_id}", headers=api_headers)
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_create_requires_api_key(client):
    resp = await client.post(
        "/api/v1/nodes",
        json={"type": "Process", "name": "Unauthorized"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_nodes_filter_by_type(client, api_headers):
    await client.post(
        "/api/v1/nodes",
        json={"type": "Process", "name": "Filter Test Process"},
        headers=api_headers,
    )
    resp = await client.get("/api/v1/nodes?node_type=Process", headers=api_headers)
    assert resp.status_code == 200
    nodes = resp.json()
    assert all(n["type"] == "Process" for n in nodes)


@pytest.mark.asyncio
async def test_mock_import_sharepoint(client, api_headers):
    resp = await client.post("/api/v1/import/sharepoint?mode=mock", headers=api_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 10
    assert data["source"] == "SHAREPOINT"


@pytest.mark.asyncio
async def test_mock_import_2c8(client, api_headers):
    resp = await client.post("/api/v1/import/2c8?mode=mock", headers=api_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 10
    assert data["source"] == "2C8"


@pytest.mark.asyncio
async def test_reimport_unarchives_node(client, api_headers):
    """A node archived (e.g. by sync pruning) must come back once its source
    record reappears in a later import — see postgres_repository.upsert_node_by_external."""
    resp = await client.post("/api/v1/import/2c8?mode=mock", headers=api_headers)
    assert resp.json()["total"] == 10

    list_resp = await client.get("/api/v1/nodes?node_type=Process&external_source=2C8", headers=api_headers)
    node_id = list_resp.json()[0]["id"]

    archive_resp = await client.patch(
        f"/api/v1/nodes/{node_id}", json={"archived": True}, headers=api_headers
    )
    assert archive_resp.json()["archived"] is True

    resp2 = await client.post("/api/v1/import/2c8?mode=mock", headers=api_headers)
    assert resp2.json()["total"] == 10

    get_resp = await client.get(f"/api/v1/nodes/{node_id}", headers=api_headers)
    assert get_resp.json()["archived"] is False
