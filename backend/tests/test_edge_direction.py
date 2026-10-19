"""Direction on INTEGRATES_WITH edges."""
import pytest


async def _make_apps(client, api_headers, prefix):
    ids = []
    for suffix in ("A", "B"):
        resp = await client.post(
            "/api/v1/nodes",
            json={"type": "Application", "name": f"{prefix} {suffix}"},
            headers=api_headers,
        )
        assert resp.status_code == 201
        ids.append(resp.json()["id"])
    return ids


@pytest.mark.asyncio
async def test_integration_defaults_to_bidirectional(client, api_headers):
    src, tgt = await _make_apps(client, api_headers, "DirDefault")
    resp = await client.post(
        "/api/v1/edges",
        json={"source_id": src, "target_id": tgt, "type": "INTEGRATES_WITH"},
        headers=api_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["attributes"]["direction"] == "BIDIRECTIONAL"


@pytest.mark.asyncio
async def test_integration_direction_is_stored(client, api_headers):
    src, tgt = await _make_apps(client, api_headers, "DirCreate")
    resp = await client.post(
        "/api/v1/edges",
        json={
            "source_id": src,
            "target_id": tgt,
            "type": "INTEGRATES_WITH",
            "direction": "TARGET_TO_SOURCE",
        },
        headers=api_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["attributes"]["direction"] == "TARGET_TO_SOURCE"


@pytest.mark.asyncio
async def test_patch_direction(client, api_headers):
    src, tgt = await _make_apps(client, api_headers, "DirPatch")
    edge_id = (await client.post(
        "/api/v1/edges",
        json={"source_id": src, "target_id": tgt, "type": "INTEGRATES_WITH"},
        headers=api_headers,
    )).json()["id"]

    resp = await client.patch(
        f"/api/v1/edges/{edge_id}/direction",
        json={"direction": "SOURCE_TO_TARGET"},
        headers=api_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["attributes"]["direction"] == "SOURCE_TO_TARGET"


@pytest.mark.asyncio
async def test_patch_direction_rejects_unknown_value(client, api_headers):
    src, tgt = await _make_apps(client, api_headers, "DirBad")
    edge_id = (await client.post(
        "/api/v1/edges",
        json={"source_id": src, "target_id": tgt, "type": "INTEGRATES_WITH"},
        headers=api_headers,
    )).json()["id"]

    resp = await client.patch(
        f"/api/v1/edges/{edge_id}/direction",
        json={"direction": "SIDEWAYS"},
        headers=api_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_non_integration_edge_gets_no_direction(client, api_headers):
    app_resp = await client.post(
        "/api/v1/nodes",
        json={"type": "Application", "name": "DirNone App"},
        headers=api_headers,
    )
    proc_resp = await client.post(
        "/api/v1/nodes",
        json={"type": "Process", "name": "DirNone Process"},
        headers=api_headers,
    )
    resp = await client.post(
        "/api/v1/edges",
        json={
            "source_id": app_resp.json()["id"],
            "target_id": proc_resp.json()["id"],
            "type": "SUPPORTS",
        },
        headers=api_headers,
    )
    assert resp.status_code == 201
    assert "direction" not in resp.json()["attributes"]
