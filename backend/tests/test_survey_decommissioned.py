"""Recipient resolution skips systems with status "Avvecklat" by default."""
import pytest


async def _create_app(client, api_headers, name: str, status: str | None) -> str:
    attributes = {"systemförvaltare": "Ulla Avveckling"}
    if status is not None:
        attributes["status"] = status
    resp = await client.post(
        "/api/v1/nodes",
        json={"type": "Application", "name": name, "attributes": attributes},
        headers=api_headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


@pytest.mark.asyncio
async def test_resolve_skips_decommissioned_unless_opted_in(client, api_headers):
    active_id = await _create_app(client, api_headers, "Avvtest Aktivt system", "Aktivt")
    decommissioned_id = await _create_app(client, api_headers, "Avvtest Gammalt system", "Avvecklat")

    survey = await client.post(
        "/api/v1/surveys",
        json={"title": "Avvecklat-test"},
        headers=api_headers,
    )
    survey_id = survey.json()["id"]
    assert survey.json()["include_decommissioned"] is False

    # Default: the decommissioned system gets no response slot
    resolved = await client.post(
        f"/api/v1/surveys/{survey_id}/resolve-recipients", headers=api_headers
    )
    node_ids = {s["node_id"] for s in resolved.json()}
    assert active_id in node_ids
    assert decommissioned_id not in node_ids

    # Opting in includes it
    patched = await client.patch(
        f"/api/v1/surveys/{survey_id}",
        json={"include_decommissioned": True},
        headers=api_headers,
    )
    assert patched.json()["include_decommissioned"] is True
    resolved = await client.post(
        f"/api/v1/surveys/{survey_id}/resolve-recipients", headers=api_headers
    )
    node_ids = {s["node_id"] for s in resolved.json()}
    assert decommissioned_id in node_ids

    # Opting back out removes its still-draft slot on re-resolve
    await client.patch(
        f"/api/v1/surveys/{survey_id}",
        json={"include_decommissioned": False},
        headers=api_headers,
    )
    resolved = await client.post(
        f"/api/v1/surveys/{survey_id}/resolve-recipients", headers=api_headers
    )
    node_ids = {s["node_id"] for s in resolved.json()}
    assert decommissioned_id not in node_ids
    assert active_id in node_ids
