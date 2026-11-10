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


@pytest.mark.asyncio
async def test_overlap_gaps_filtreras_med_behorigheten(client, api_headers, monkeypatch):
    """REGRESSION: /views/overlap-gaps visade objekt och applikationsnamn som
    användaren inte får se."""
    from app.access import Policy
    from app.api.v1 import views

    async def nod(typ, namn):
        resp = await client.post("/api/v1/nodes", json={"type": typ, "name": namn}, headers=api_headers)
        assert resp.status_code == 201
        return resp.json()["id"]

    async def stod(app, proc):
        resp = await client.post(
            "/api/v1/edges", json={"source_id": app, "target_id": proc, "type": "SUPPORTS"}, headers=api_headers,
        )
        assert resp.status_code == 201

    a, b, dold_app = [await nod("Application", f"Öv {n}") for n in ("A", "B", "Dold app")]
    p_tva = await nod("Process", "Öv process – två synliga")
    p_en = await nod("Process", "Öv process – en synlig")
    p_dold = await nod("Process", "Öv process – dold")
    p_dold_lucka = await nod("Process", "Öv process – dold lucka")
    for app in (a, b, dold_app):
        await stod(app, p_tva)
    await stod(a, p_en)
    await stod(dold_app, p_en)
    await stod(a, p_dold)
    await stod(b, p_dold)
    dolda = {dold_app, p_dold, p_dold_lucka}

    async def policy(_user):
        return Policy(full=True, hidden_ids=dolda)

    monkeypatch.setattr(views, "load_policy", policy)
    data = (await client.get("/api/v1/views/overlap-gaps", headers=api_headers)).json()

    overlaps = {r["id"]: r for r in data["overlaps"]["overlapping_processes"]}
    assert overlaps[p_tva]["app_names"] == ["Öv A", "Öv B"]
    assert overlaps[p_tva]["app_count"] == 2
    assert "app_ids" not in overlaps[p_tva]
    assert p_en not in overlaps and p_dold not in overlaps
    alla_id = {r["id"] for lista in (*data["overlaps"].values(), *data["gaps"].values()) for r in lista}
    assert not alla_id & dolda
    assert "Öv Dold app" not in str(data)
