"""Svar på en kvalitetsflagga: flaggan måste höra till noden i adressen, och
noden måste synas för den som svarar."""
import uuid

import pytest

from app.auth import issue_local_token


async def _flagga(client, api_headers, typ: str, namn: str) -> tuple[str, str]:
    node = await client.post("/api/v1/nodes", json={"type": typ, "name": namn}, headers=api_headers)
    assert node.status_code == 201, node.text
    nid = node.json()["id"]
    flag = await client.post(
        f"/api/v1/nodes/{nid}/flags", json={"flag_type": "OUTDATED", "description": "Gammal"}, headers=api_headers,
    )
    assert flag.status_code == 201, flag.text
    return nid, flag.json()["id"]


@pytest.mark.asyncio
async def test_svar_kraver_att_flaggan_hor_till_noden(client, repo, api_headers):
    a, flagga_a = await _flagga(client, api_headers, "Application", f"App {uuid.uuid4().hex[:6]}")
    b, _ = await _flagga(client, api_headers, "Application", f"App {uuid.uuid4().hex[:6]}")

    # REGRESSION: flaggan på A gick att besvara via B:s adress.
    fel = await client.patch(f"/api/v1/nodes/{b}/flags/{flagga_a}/response", json={"response": "x"}, headers=api_headers)
    assert fel.status_code == 404

    ratt = await client.patch(f"/api/v1/nodes/{a}/flags/{flagga_a}/response", json={"response": "Åtgärdad"}, headers=api_headers)
    assert ratt.status_code == 200, ratt.text
    assert ratt.json()["response"] == "Åtgärdad"


@pytest.mark.asyncio
async def test_svar_kraver_att_noden_syns(client, repo, api_headers):
    # En superanvändare utan behörighet till Servrar ser inte servrarna.
    server, flagga = await _flagga(client, api_headers, "Server", f"Srv {uuid.uuid4().hex[:6]}")
    user = await repo.create_local_user(
        name="Super Utan Servrar", email=f"su-{uuid.uuid4().hex[:6]}@example.org", password_hash="x", role="superuser",
    )
    headers = {"Authorization": f"Bearer {issue_local_token(user)}"}
    r = await client.patch(f"/api/v1/nodes/{server}/flags/{flagga}/response", json={"response": "x"}, headers=headers)
    assert r.status_code == 404
