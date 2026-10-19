"""View and analysis endpoint tests (requires seeded data)."""
import pytest


@pytest.mark.asyncio
async def test_landscape_returns_graph(client, api_headers):
    # Seed first
    await client.post("/api/v1/import/sharepoint?mode=mock", headers=api_headers)
    resp = await client.get("/api/v1/views/landscape", headers=api_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "nodes" in data
    assert "edges" in data
    assert len(data["nodes"]) > 0


@pytest.mark.asyncio
async def test_overlap_gaps_structure(client, api_headers):
    resp = await client.get("/api/v1/views/overlap-gaps", headers=api_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "overlaps" in data
    assert "gaps" in data
    assert "unsupported_processes" in data["gaps"]
    assert "orphaned_applications" in data["gaps"]


@pytest.mark.asyncio
async def test_search_nodes(client, api_headers):
    await client.post("/api/v1/import/sharepoint?mode=mock", headers=api_headers)
    resp = await client.get("/api/v1/search?q=SAP", headers=api_headers)
    assert resp.status_code == 200
    results = resp.json()
    assert any("SAP" in n["name"] for n in results)
