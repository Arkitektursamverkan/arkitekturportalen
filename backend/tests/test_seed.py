"""Demo data: offered only while the portal has no nodes.

The test database is shared between tests, so the empty case replaces what the
repository lists. test_seed_loads_into_an_empty_database needs a truly empty
database and skips otherwise.
"""
import pytest

from app.schemas.common import NodeType
from app.schemas.node import NodeCreate


@pytest.mark.asyncio
async def test_status_is_available_without_nodes(client, api_headers, repo, monkeypatch):
    async def inga(*_a, **_k):
        return []

    monkeypatch.setattr(repo, "list_nodes", inga)
    resp = await client.get("/api/v1/seed/status", headers=api_headers)
    assert resp.status_code == 200
    assert resp.json() == {"available": True}


@pytest.mark.asyncio
async def test_seed_loads_into_an_empty_database(client, api_headers, repo):
    if await repo.list_nodes(limit=1):
        pytest.skip("the test database already holds nodes")
    resp = await client.post("/api/v1/seed", headers=api_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["sharepoint"]["created"] > 0
    assert (await client.get("/api/v1/seed/status", headers=api_headers)).json() == {"available": False}


@pytest.mark.asyncio
async def test_nodes_make_it_unavailable_and_seed_refuses(client, api_headers, repo):
    await repo.create_node(NodeCreate(type=NodeType.APPLICATION, name="Riktig applikation"))
    resp = await client.get("/api/v1/seed/status", headers=api_headers)
    assert resp.json() == {"available": False}
    assert (await client.post("/api/v1/seed", headers=api_headers)).status_code == 409
