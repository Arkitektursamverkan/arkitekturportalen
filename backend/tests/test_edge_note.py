"""A note on an edge is a change to the edge: same right as the others."""
import pytest

from app.auth import issue_local_token


async def _anvandare(repo, epost: str, roll: str) -> dict:
    user = await repo.create_local_user(name=epost.split("@")[0], email=epost, password_hash="x", role=roll)
    return {"Authorization": f"Bearer {issue_local_token(user)}"}


async def _kant(client, api_headers) -> str:
    ids = []
    for namn in ("Kantnot A", "Kantnot B"):
        resp = await client.post("/api/v1/nodes", json={"type": "Application", "name": namn}, headers=api_headers)
        ids.append(resp.json()["id"])
    resp = await client.post(
        "/api/v1/edges", json={"source_id": ids[0], "target_id": ids[1], "type": "INTEGRATES_WITH"}, headers=api_headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


@pytest.mark.asyncio
async def test_lasare_far_inte_skriva_kantnot(client, api_headers, repo):
    """REGRESSION: PATCH /edges/{id}/note krävde bara inloggning."""
    kant = await _kant(client, api_headers)
    lasare = await _anvandare(repo, "kantnot.lasare@example.org", "user")
    redaktor = await _anvandare(repo, "kantnot.redaktor@example.org", "superuser")

    resp = await client.patch(f"/api/v1/edges/{kant}/note", json={"note": "Skrivet av läsare"}, headers=lasare)
    assert resp.status_code == 403
    resp = await client.patch(f"/api/v1/edges/{kant}/note", json={"note": "Kontrollerad"}, headers=redaktor)
    assert resp.status_code == 200
