"""A sync profile's platform key never reaches the browser in clear."""
import pytest

from app.api.v1 import sync as sync_module

PROFIL = {"flow_id": "flode-1", "node_type": "Application", "platform_api_key": "hemlig-nyckel-1234"}


@pytest.fixture(autouse=True)
def _egen_fil(tmp_path, monkeypatch):
    monkeypatch.setattr(sync_module, "SYNC_PROFILES_PATH", tmp_path / "profiles.json")
    monkeypatch.setenv("INTEGRATION_PLATFORM_URL", "http://example.org")


async def _lagrad() -> str:
    return sync_module._load_profiles()["flode-1"].platform_api_key


@pytest.mark.asyncio
async def test_nyckeln_maskeras_i_listan(client, api_headers):
    assert (await client.post("/api/v1/sync/profiles", json=PROFIL, headers=api_headers)).status_code == 200
    profiler = (await client.get("/api/v1/sync/profiles", headers=api_headers)).json()
    assert profiler[0]["platform_api_key"] == "••••1234"
    assert "hemlig" not in str(profiler)


@pytest.mark.asyncio
@pytest.mark.parametrize("skickad", ["••••1234", ""])
async def test_maskerad_eller_tom_nyckel_behaller_den_lagrade(client, api_headers, skickad):
    await client.post("/api/v1/sync/profiles", json=PROFIL, headers=api_headers)
    andrad = {**PROFIL, "platform_api_key": skickad, "enabled": False}
    assert (await client.post("/api/v1/sync/profiles", json=andrad, headers=api_headers)).status_code == 200
    assert await _lagrad() == "hemlig-nyckel-1234"
    assert sync_module._load_profiles()["flode-1"].enabled is False


@pytest.mark.asyncio
async def test_ny_nyckel_ersatter_den_lagrade(client, api_headers):
    await client.post("/api/v1/sync/profiles", json=PROFIL, headers=api_headers)
    await client.post("/api/v1/sync/profiles", json={**PROFIL, "platform_api_key": "ny-nyckel"}, headers=api_headers)
    assert await _lagrad() == "ny-nyckel"


@pytest.mark.asyncio
async def test_maskerad_nyckel_utan_profil_avvisas(client, api_headers):
    resp = await client.post("/api/v1/sync/profiles", json={**PROFIL, "platform_api_key": "••••1234"}, headers=api_headers)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_fel_api_nyckel_avvisas(client):
    assert (await client.get("/api/v1/sync/profiles", headers={"X-Api-Key": "fel"})).status_code == 401


@pytest.mark.asyncio
async def test_maskerad_nyckel_for_falt_kraver_sparad_profil(client, api_headers):
    resp = await client.post(
        "/api/v1/import/platform/sources/fields",
        json={"platform_url": "http://example.org", "platform_api_key": "••••1234", "flow_id": "okant"},
        headers=api_headers,
    )
    assert resp.status_code == 404
