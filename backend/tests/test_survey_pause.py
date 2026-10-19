"""Paused surveys: no new distribution, but answering stays open."""
import pytest


@pytest.mark.asyncio
async def test_paused_random_survey_stops_offers_until_resumed(client, api_headers, repo):
    user = await repo.create_local_user(
        name="Paus Persson", email="paus.persson@example.org", password_hash="x", role="user"
    )
    node = await client.post(
        "/api/v1/nodes",
        json={"type": "InformationObject", "name": "Paustest Objekt"},
        headers=api_headers,
    )
    assert node.status_code == 201

    survey = await client.post(
        "/api/v1/surveys",
        json={"title": "Paustest slump", "kind": "random_system", "target_node_type": "InformationObject"},
        headers=api_headers,
    )
    survey_id = survey.json()["id"]
    await client.patch(f"/api/v1/surveys/{survey_id}", json={"status": "open"}, headers=api_headers)

    offered = await repo.check_random_survey_trigger(user.id, probability=1.0)
    assert offered is not None

    # Paused: neither new offers nor re-nags of the pending slot.
    resp = await client.patch(
        f"/api/v1/surveys/{survey_id}", json={"status": "paused"}, headers=api_headers
    )
    assert resp.status_code == 200 and resp.json()["status"] == "paused"
    assert await repo.check_random_survey_trigger(user.id, probability=1.0) is None

    # Resumed: the postponed slot is offered again.
    await client.patch(f"/api/v1/surveys/{survey_id}", json={"status": "open"}, headers=api_headers)
    again = await repo.check_random_survey_trigger(user.id, probability=1.0)
    assert again is not None and again["id"] == offered["id"]

    await client.post(f"/api/v1/surveys/{survey_id}/close", headers=api_headers)


@pytest.mark.asyncio
async def test_paused_standard_survey_blocks_launch_but_not_answers(client, api_headers, repo):
    user = await repo.create_local_user(
        name="Paus Palm", email="paus.palm@example.org", password_hash="x", role="user"
    )
    survey = await client.post(
        "/api/v1/surveys", json={"title": "Paustest vanlig"}, headers=api_headers
    )
    survey_id = survey.json()["id"]
    manual = await client.post(
        f"/api/v1/surveys/{survey_id}/responses/manual",
        json={"user_id": str(user.id)},
        headers=api_headers,
    )
    response_id = manual.json()["id"]
    launched = await client.post(f"/api/v1/surveys/{survey_id}/launch", headers=api_headers)
    assert launched.json()["launched"] == 1

    await client.patch(f"/api/v1/surveys/{survey_id}", json={"status": "paused"}, headers=api_headers)

    blocked = await client.post(f"/api/v1/surveys/{survey_id}/launch", headers=api_headers)
    assert blocked.status_code == 400
    assert "pausad" in blocked.json()["detail"]

    # Already-launched recipients can still answer while paused.
    submitted = await client.post(
        f"/api/v1/my-surveys/{response_id}/answers",
        json={"answers": {}},
        headers=api_headers,
    )
    assert submitted.status_code == 200
    assert submitted.json()["status"] == "submitted"
