"""Läsning utan inloggning är en inställning, avstängd som standard.

Kontraktet som låses här:
- Avstängd: läsendpoints svarar 401 på anrop utan inloggning.
- Påslagen (i miljön eller under Administration → Organisation): anonyma
  anrop får det som Alla-behörigheterna ger, som tidigare.
- Inställningen i databasen går före miljön, åt båda hållen.
- Endpoints som hämtar adresser eller tar emot importfiler kräver alltid
  inloggning, oavsett inställningen.
"""
import pytest
from sqlalchemy import delete

from app.config import settings
from app.models.org_settings import OrgSettingsORM
from app.services import org_settings

LASA = [
    "/api/v1/nodes",
    "/api/v1/edges",
    "/api/v1/search?q=x",
    "/api/v1/views/landscape",
    "/api/v1/views/overlap-gaps",
    "/api/v1/principles",
    "/api/v1/import/csv/export",
]


@pytest.fixture(autouse=True)
async def _tomma_installningar(repo, monkeypatch):
    monkeypatch.setattr(settings, "ANONYMOUS_READ", False)

    async def rensa():
        async with repo._session_factory() as s:
            await s.execute(delete(OrgSettingsORM))
            await s.commit()
        await org_settings.load(repo._session_factory)

    await rensa()
    yield
    await rensa()


async def _koder(client) -> dict[str, int]:
    return {url: (await client.get(url)).status_code for url in LASA}


@pytest.mark.asyncio
async def test_avstangd_som_standard(client, api_headers):
    assert set((await _koder(client)).values()) == {401}
    # Inloggade läser som vanligt.
    assert (await client.get("/api/v1/nodes", headers=api_headers)).status_code == 200
    # Det inloggningssidan behöver är fortfarande öppet.
    assert (await client.get("/api/v1/org-settings/public")).status_code == 200
    assert (await client.get("/api/v1/health")).status_code == 200


@pytest.mark.asyncio
async def test_pa_i_miljon_och_databasen_gar_fore(client, api_headers, monkeypatch):
    monkeypatch.setattr(settings, "ANONYMOUS_READ", True)
    assert set((await _koder(client)).values()) == {200}

    resp = await client.put("/api/v1/org-settings", json={"anonymous_read": False}, headers=api_headers)
    assert resp.json()["values"]["anonymous_read"] is False
    assert resp.json()["defaults"]["anonymous_read"] is True
    assert set((await _koder(client)).values()) == {401}

    # null = tillbaka till miljön.
    await client.put("/api/v1/org-settings", json={"anonymous_read": None}, headers=api_headers)
    assert set((await _koder(client)).values()) == {200}


@pytest.mark.asyncio
async def test_pa_under_administration(client, api_headers):
    await client.put("/api/v1/org-settings", json={"anonymous_read": True}, headers=api_headers)
    assert set((await _koder(client)).values()) == {200}


@pytest.mark.asyncio
async def test_hamtning_och_import_kraver_alltid_inloggning(client, api_headers):
    await client.put("/api/v1/org-settings", json={"anonymous_read": True}, headers=api_headers)
    anrop = [
        ("/api/v1/theme/extract", {"json": {"url": "http://169.254.169.254/"}}),
        ("/api/v1/import/platform/sources", {"json": {"platform_url": "http://example.org"}}),
        ("/api/v1/import/platform/sources/fields", {"json": {"platform_url": "http://example.org", "flow_id": "x"}}),
        ("/api/v1/import/csv/preview/unified", {"files": {"file": ("a.csv", b"name\n", "text/csv")}}),
    ]
    for url, kwargs in anrop:
        assert (await client.post(url, **kwargs)).status_code == 401, url
    assert (await client.get("/api/v1/whoami")).status_code == 404


@pytest.mark.asyncio
async def test_platformens_nodtyper_kraver_inloggning(client, api_headers):
    assert (await client.get("/api/v1/import/platform/node-types")).status_code == 401
    assert (await client.get("/api/v1/import/platform/node-types", headers=api_headers)).status_code == 200
