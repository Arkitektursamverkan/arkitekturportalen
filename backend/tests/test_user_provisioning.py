"""Pre-provisioned users: matchningslista, bulk creation, Entra linking."""
import pytest


async def _create_app_node(client, api_headers, name: str, attributes: dict) -> str:
    resp = await client.post(
        "/api/v1/nodes",
        json={"type": "Application", "name": name, "attributes": attributes},
        headers=api_headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


@pytest.mark.asyncio
async def test_provision_candidates_from_system_roles(client, api_headers):
    await _create_app_node(
        client, api_headers, "Provtest Ekonomisystem", {"systemförvaltare": "Greta Provsson"}
    )
    await _create_app_node(
        client,
        api_headers,
        "Provtest Lönesystem",
        {"systemförvaltare": "Greta Provsson", "systemägare": "Örjan Provkvist"},
    )

    resp = await client.get("/api/v1/users/provision-candidates", headers=api_headers)
    assert resp.status_code == 200
    by_name = {c["name"]: c for c in resp.json()}

    greta = by_name["Greta Provsson"]
    assert greta["suggested_email"] == "greta.provsson@example.org"
    assert greta["email_is_guessed"] is True
    assert greta["existing_user_id"] is None
    assert greta["roles"] == ["systemförvaltare"]
    assert {s["node_name"] for s in greta["sources"]} == {
        "Provtest Ekonomisystem",
        "Provtest Lönesystem",
    }

    orjan = by_name["Örjan Provkvist"]
    assert orjan["suggested_email"] == "orjan.provkvist@example.org"
    assert orjan["roles"] == ["systemägare"]


@pytest.mark.asyncio
async def test_provision_creates_users_and_survey_assigns_them(client, api_headers, repo):
    await _create_app_node(
        client, api_headers, "Provtest Ärendesystem", {"systemförvaltare": "Nils Provlund"}
    )

    resp = await client.post(
        "/api/v1/users/provision",
        json={"users": [{"name": "Nils Provlund", "email": "nils.provlund@example.org"}]},
        headers=api_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["skipped"] == []
    (created,) = body["created"]
    assert created["is_provisioned"] is True
    assert created["is_local"] is False
    assert created["last_login_at"] is None
    assert created["role"] == "user"

    # Re-provisioning the same email is skipped, not duplicated
    resp2 = await client.post(
        "/api/v1/users/provision",
        json={"users": [{"name": "Nils Provlund", "email": "nils.provlund@example.org"}]},
        headers=api_headers,
    )
    assert resp2.status_code == 201
    assert resp2.json()["created"] == []
    assert len(resp2.json()["skipped"]) == 1

    # The candidate now shows up as already covered
    resp3 = await client.get("/api/v1/users/provision-candidates", headers=api_headers)
    nils = next(c for c in resp3.json() if c["name"] == "Nils Provlund")
    assert nils["existing_user_id"] == created["id"]

    # A survey targeting systemförvaltare assigns the pre-provisioned user
    survey = await client.post(
        "/api/v1/surveys",
        json={"title": "Provtest-enkät", "target_attribute_key": "systemförvaltare"},
        headers=api_headers,
    )
    assert survey.status_code == 201
    survey_id = survey.json()["id"]
    resolved = await client.post(
        f"/api/v1/surveys/{survey_id}/resolve-recipients", headers=api_headers
    )
    assert resolved.status_code == 200
    slot = next(s for s in resolved.json() if s["node_name"] == "Provtest Ärendesystem")
    assert slot["match_status"] == "matched"
    assert slot["assigned_user_id"] == created["id"]


@pytest.mark.asyncio
async def test_entra_login_links_provisioned_user_by_email(client, api_headers, repo):
    resp = await client.post(
        "/api/v1/users/provision",
        json={
            "users": [
                {"name": "Lisa Provgren", "email": "lisa.provgren@example.org", "role": "superuser"}
            ]
        },
        headers=api_headers,
    )
    assert resp.status_code == 201
    provisioned_id = resp.json()["created"][0]["id"]

    user = await repo.find_or_create_user_from_claims(
        "entra",
        {
            "oid": "00000000-provtest-lisa",
            "name": "Lisa Provgrén",
            "preferred_username": "Lisa.Provgren@example.org",
        },
    )
    assert str(user.id) == provisioned_id  # linked, not duplicated
    assert user.entra_oid == "00000000-provtest-lisa"
    assert user.role == "superuser"  # pre-assigned role survives first login
    assert user.last_login_at is not None
    assert user.name == "Lisa Provgrén"

    # Second login resolves by oid as usual
    again = await repo.find_or_create_user_from_claims(
        "entra",
        {
            "oid": "00000000-provtest-lisa",
            "name": "Lisa Provgrén",
            "preferred_username": "lisa.provgren@example.org",
        },
    )
    assert str(again.id) == provisioned_id
