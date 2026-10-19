"""Egna uppgifter med API-nyckeln: systemanvändaren har ingen användarrad,
så Mina enkäter och startsidans genvägar ger tomt (eller 400 vid sparande)
i stället för ett serverfel."""
import uuid

import pytest


@pytest.mark.asyncio
async def test_api_nyckeln_har_inga_egna_enkater(client, api_headers):
    resp = await client.get("/api/v1/my-surveys", headers=api_headers)
    assert resp.status_code == 200 and resp.json() == []
    resp = await client.post("/api/v1/my-surveys/random-check", headers=api_headers)
    assert resp.status_code == 200 and resp.json()["response"] is None
    assert (await client.get(f"/api/v1/my-surveys/{uuid.uuid4()}", headers=api_headers)).status_code in (403, 404)


@pytest.mark.asyncio
async def test_api_nyckeln_har_inga_genvagar(client, api_headers):
    resp = await client.get("/api/v1/users/me/shortcuts", headers=api_headers)
    assert resp.status_code == 200 and resp.json() == {"paths": []}
    resp = await client.put("/api/v1/users/me/shortcuts", json={"paths": ["/systems"]}, headers=api_headers)
    assert resp.status_code == 400
