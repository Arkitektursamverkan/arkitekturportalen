"""Random-system surveys ("slumpenkäter"): login-triggered random node offers."""
from uuid import UUID, uuid4

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.survey_response import SurveyResponseORM

# A node type other tests barely touch, so the random pool stays predictable.
POOL_NODE_TYPE = "InformationObject"


async def _create_node(client, api_headers, name: str, *, status: str | None = None) -> str:
    attributes = {"status": status} if status else {}
    resp = await client.post(
        "/api/v1/nodes",
        json={"type": POOL_NODE_TYPE, "name": name, "attributes": attributes},
        headers=api_headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _create_random_survey(client, api_headers, title: str) -> str:
    resp = await client.post(
        "/api/v1/surveys",
        json={"title": title, "kind": "random_system", "target_node_type": POOL_NODE_TYPE},
        headers=api_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["kind"] == "random_system"
    return resp.json()["id"]


async def _exhaust_pool(repo, user_id: UUID) -> list[str]:
    """Answer offered random slots until the trigger runs dry; return node ids."""
    offered: list[str] = []
    for _ in range(50):
        row = await repo.check_random_survey_trigger(user_id, probability=1.0)
        if row is None:
            return offered
        assert row["match_status"] == "random"
        assert row["status"] == "pending"
        # Re-triggering before answering re-offers the SAME slot (postpone).
        again = await repo.check_random_survey_trigger(user_id, probability=1.0)
        assert again is not None and again["id"] == row["id"]
        await repo.submit_survey_response(row["id"], answers={}, submitted_by="test")
        offered.append(str(row["node_id"]))
    raise AssertionError("random-survey pool never ran dry")


@pytest.mark.asyncio
async def test_random_survey_rejects_recipient_lifecycle(client, api_headers):
    survey_id = await _create_random_survey(client, api_headers, "Slumptest livscykel")

    resp = await client.post(f"/api/v1/surveys/{survey_id}/resolve-recipients", headers=api_headers)
    assert resp.status_code == 400
    resp = await client.post(
        f"/api/v1/surveys/{survey_id}/responses/manual",
        json={"user_id": str(uuid4())},
        headers=api_headers,
    )
    assert resp.status_code == 400
    resp = await client.post(f"/api/v1/surveys/{survey_id}/launch", headers=api_headers)
    assert resp.status_code == 400

    # kind shows up in the list and is opened via a plain status PATCH
    listed = await client.get("/api/v1/surveys", headers=api_headers)
    match = next(s for s in listed.json() if s["id"] == survey_id)
    assert match["kind"] == "random_system"
    resp = await client.patch(
        f"/api/v1/surveys/{survey_id}", json={"status": "open"}, headers=api_headers
    )
    assert resp.status_code == 200 and resp.json()["status"] == "open"

    # Close it again so later tests can assert "no open random survey".
    resp = await client.post(f"/api/v1/surveys/{survey_id}/close", headers=api_headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_random_check_endpoint_null_for_api_key_principal(client, api_headers):
    resp = await client.post("/api/v1/my-surveys/random-check", headers=api_headers)
    assert resp.status_code == 200
    assert resp.json() == {"response": None}


@pytest.mark.asyncio
async def test_random_trigger_flow(client, api_headers, repo):
    user = await repo.create_local_user(
        name="Slump Svensson", email="slump.svensson@example.org", password_hash="x", role="user"
    )

    # No open random survey yet -> nothing offered even on a winning roll.
    assert await repo.check_random_survey_trigger(user.id, probability=1.0) is None

    node_a = await _create_node(client, api_headers, "Slumptest Objekt A")
    node_b = await _create_node(client, api_headers, "Slumptest Objekt B")
    node_dec = await _create_node(client, api_headers, "Slumptest Avvecklat", status="Avvecklat")

    survey_id = await _create_random_survey(client, api_headers, "Slumptest trigger")
    resp = await client.patch(
        f"/api/v1/surveys/{survey_id}", json={"status": "open"}, headers=api_headers
    )
    assert resp.status_code == 200

    # A losing roll never offers anything.
    assert await repo.check_random_survey_trigger(user.id, probability=0.0) is None

    # A pending standard survey pauses the random survey entirely.
    std = await client.post(
        "/api/v1/surveys", json={"title": "Slumptest vanlig enkät"}, headers=api_headers
    )
    std_id = std.json()["id"]
    manual = await client.post(
        f"/api/v1/surveys/{std_id}/responses/manual",
        json={"user_id": str(user.id)},
        headers=api_headers,
    )
    assert manual.status_code == 201
    launched = await client.post(f"/api/v1/surveys/{std_id}/launch", headers=api_headers)
    assert launched.json()["launched"] == 1
    assert await repo.check_random_survey_trigger(user.id, probability=1.0) is None

    std_rows = await repo.list_survey_responses(survey_id=UUID(std_id))
    await repo.submit_survey_response(std_rows[0]["id"], answers={}, submitted_by="test")

    # Pool excludes the decommissioned node by default and never repeats a node.
    offered = await _exhaust_pool(repo, user.id)
    assert node_a in offered
    assert node_b in offered
    assert node_dec not in offered
    assert len(offered) == len(set(offered))

    # Opting in to decommissioned systems widens the pool.
    resp = await client.patch(
        f"/api/v1/surveys/{survey_id}",
        json={"include_decommissioned": True},
        headers=api_headers,
    )
    assert resp.status_code == 200
    offered_after_opt_in = await _exhaust_pool(repo, user.id)
    assert node_dec in offered_after_opt_in

    # Pool exhausted -> nothing more offered.
    assert await repo.check_random_survey_trigger(user.id, probability=1.0) is None

    # The slots exist, but stay hidden from Mina enkäter — answered or not.
    all_rows = await repo.list_survey_responses(assigned_user_id=user.id)
    random_rows = [r for r in all_rows if r["survey_kind"] == "random_system"]
    assert {str(r["node_id"]) for r in random_rows} >= {node_a, node_b, node_dec}
    mine = await repo.list_survey_responses(assigned_user_id=user.id, for_my_surveys=True)
    assert all(r["survey_kind"] != "random_system" for r in mine)
    # ...while the ordinary survey the user answered is still listed there.
    assert any(str(r["survey_id"]) == std_id for r in mine)

    # A postponed (still pending) slot is hidden from Mina enkäter as well —
    # the login dialog re-offers it instead of the list nagging about it.
    await _create_node(client, api_headers, "Slumptest Objekt C")
    postponed = await repo.check_random_survey_trigger(user.id, probability=1.0)
    assert postponed is not None and postponed["status"] == "pending"
    mine = await repo.list_survey_responses(assigned_user_id=user.id, for_my_surveys=True)
    assert all(r["id"] != postponed["id"] for r in mine)

    await client.post(f"/api/v1/surveys/{survey_id}/close", headers=api_headers)


@pytest.mark.asyncio
async def test_random_slot_unique_per_survey_node_user(client, api_headers, repo):
    user = await repo.create_local_user(
        name="Dubblett Dahl", email="dubblett.dahl@example.org", password_hash="x", role="user"
    )
    node_id = await _create_node(client, api_headers, "Slumptest Dubblettobjekt")
    survey_id = await _create_random_survey(client, api_headers, "Slumptest dubbletter")

    async with repo._session_factory() as s:
        for _ in range(2):
            s.add(
                SurveyResponseORM(
                    survey_id=UUID(survey_id),
                    node_id=UUID(node_id),
                    assigned_user_id=user.id,
                    match_status="random",
                    status="pending",
                    answers={},
                    token=f"dup-test-{uuid4()}",
                )
            )
        with pytest.raises(IntegrityError):
            await s.commit()
