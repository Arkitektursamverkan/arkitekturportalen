"""The portal calls only allowed platforms, and the installation's key only its own.

Kontraktet som låses här:
- Bara INTEGRATION_PLATFORM_URL och adresserna i INTEGRATION_PLATFORM_ALLOWED_URLS
  får anropas – import, fältlista och synkprofiler med annan adress får 422,
  och inget anrop görs.
- Installationens nyckel skickas bara till INTEGRATION_PLATFORM_URL.
- En sparad nyckel behålls (maskerat/tomt värde) bara när adressen är oförändrad.
- Plattformens felkropp når aldrig klienten; bara en statuskod.
"""
from __future__ import annotations

from typing import Any

import pytest

from app import platform_access
from app.api.v1 import platform_import
from app.api.v1 import sync as sync_module

EGEN = "http://plattform.test:8000/api/v1"
ANNAN = "https://annan-plattform.example.org/api/v1"


@pytest.fixture(autouse=True)
def _miljo(tmp_path, monkeypatch):
    monkeypatch.setattr(sync_module, "SYNC_PROFILES_PATH", tmp_path / "profiles.json")
    monkeypatch.setenv("INTEGRATION_PLATFORM_URL", EGEN)
    monkeypatch.setenv("INTEGRATION_PLATFORM_API_KEY", "installationens-nyckel")
    monkeypatch.delenv("INTEGRATION_PLATFORM_ALLOWED_URLS", raising=False)


class _Svar:
    def __init__(self, status: int, data: Any = None, text: str = "") -> None:
        self.status_code = status
        self._data = data
        self.text = text

    def json(self) -> Any:
        return self._data


def _falsk_plattform(monkeypatch, module, svar: _Svar) -> list[dict]:
    anrop: list[dict] = []

    class Klient:
        def __init__(self, *a, **kw) -> None: ...
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False

        async def get(self, url, headers=None, params=None):
            anrop.append({"url": url, "key": (headers or {}).get("X-Api-Key")})
            return svar

    monkeypatch.setattr(module.httpx, "AsyncClient", Klient)
    return anrop


# ── Adresser ────────────────────────────────────────────────────────────────

def test_bara_tillatna_adresser(monkeypatch):
    assert platform_access.resolve("") == EGEN
    assert platform_access.resolve("HTTP://Plattform.test:8000/api/v1/") == "HTTP://Plattform.test:8000/api/v1"
    for fel in (ANNAN, "http://169.254.169.254/latest", "file:///etc/passwd",
                "http://user:pw@plattform.test:8000/api/v1", "http://plattform.test:9000/api/v1"):
        with pytest.raises(platform_access.PlatformAddressError):
            platform_access.resolve(fel)
    monkeypatch.setenv("INTEGRATION_PLATFORM_ALLOWED_URLS", f" {ANNAN} , annan-intern:8000")
    assert platform_access.resolve(ANNAN) == ANNAN
    assert platform_access.resolve("http://annan-intern:8000/api/v1") == "http://annan-intern:8000/api/v1"


def test_installationens_nyckel_bara_till_egen_plattform(monkeypatch):
    monkeypatch.setenv("INTEGRATION_PLATFORM_ALLOWED_URLS", ANNAN)
    assert platform_access.key_for(EGEN, "") == "installationens-nyckel"
    assert platform_access.key_for(ANNAN, "") == ""
    assert platform_access.key_for(ANNAN, "egen") == "egen"


# ── Synkprofiler ────────────────────────────────────────────────────────────

PROFIL = {"flow_id": "flode-1", "node_type": "Application", "platform_api_key": "hemlig-nyckel-1234"}


async def _lagrad() -> str:
    return sync_module._load_profiles()["flode-1"].platform_api_key


@pytest.mark.asyncio
async def test_profil_med_otillaten_adress_avvisas(client, api_headers):
    resp = await client.post("/api/v1/sync/profiles", json={**PROFIL, "platform_url": ANNAN}, headers=api_headers)
    assert resp.status_code == 422
    assert "flode-1" not in sync_module._load_profiles()


@pytest.mark.asyncio
async def test_maskerad_nyckel_foljer_inte_med_till_ny_adress(client, api_headers, monkeypatch):
    """REGRESSION: en admin kunde peka om en profil och få den sparade nyckeln skickad dit."""
    monkeypatch.setenv("INTEGRATION_PLATFORM_ALLOWED_URLS", ANNAN)
    assert (await client.post("/api/v1/sync/profiles", json=PROFIL, headers=api_headers)).status_code == 200
    for skickad in ("••••1234", ""):
        resp = await client.post(
            "/api/v1/sync/profiles", json={**PROFIL, "platform_url": ANNAN, "platform_api_key": skickad},
            headers=api_headers,
        )
        assert resp.status_code == 422, skickad
        assert resp.json()["detail"] == "Ange plattformens API-nyckel"
    assert await _lagrad() == "hemlig-nyckel-1234"
    assert sync_module._load_profiles()["flode-1"].platform_url == ""


@pytest.mark.asyncio
async def test_maskerad_nyckel_behalls_nar_adressen_ar_oforandrad(client, api_headers):
    """Befintliga profiler mot installationens plattform fungerar som förut –
    också när adressen skrivs ut i stället för att lämnas tom."""
    await client.post("/api/v1/sync/profiles", json={**PROFIL, "platform_url": EGEN}, headers=api_headers)
    for adress in (EGEN, EGEN + "/"):
        resp = await client.post(
            "/api/v1/sync/profiles", json={**PROFIL, "platform_url": adress, "platform_api_key": "••••1234"},
            headers=api_headers,
        )
        assert resp.status_code == 200
    assert await _lagrad() == "hemlig-nyckel-1234"


@pytest.mark.asyncio
async def test_profil_utan_egen_nyckel_mot_annan_plattform_avvisas(client, api_headers, monkeypatch):
    monkeypatch.setenv("INTEGRATION_PLATFORM_ALLOWED_URLS", ANNAN)
    # Mot installationens plattform räcker installationens nyckel …
    resp = await client.post("/api/v1/sync/profiles", json={**PROFIL, "platform_api_key": ""}, headers=api_headers)
    assert resp.status_code == 200
    # … men den skickas aldrig till en annan.
    resp = await client.post(
        "/api/v1/sync/profiles", json={**PROFIL, "flow_id": "f2", "platform_url": ANNAN, "platform_api_key": ""},
        headers=api_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_synk_skickar_installationens_nyckel_bara_hem(repo, monkeypatch):
    """REGRESSION: en profil med egen adress och utan nyckel fick installationens nyckel."""
    anrop = _falsk_plattform(monkeypatch, sync_module, _Svar(200, {"records": [], "total": 0, "page_size": 500}))
    await sync_module._run_sync(sync_module.SyncProfile(flow_id="f", node_type="Application"), repo)
    assert anrop == [{"url": f"{EGEN}/data/f/records", "key": "installationens-nyckel"}]

    anrop.clear()
    monkeypatch.setenv("INTEGRATION_PLATFORM_ALLOWED_URLS", ANNAN)
    with pytest.raises(sync_module.SyncError):
        await sync_module._run_sync(sync_module.SyncProfile(flow_id="f", node_type="Application", platform_url=ANNAN), repo)
    # En profil sparad innan kontrollen fanns, med en adress som inte är tillåten.
    monkeypatch.delenv("INTEGRATION_PLATFORM_ALLOWED_URLS")
    with pytest.raises(sync_module.SyncError):
        await sync_module._run_sync(
            sync_module.SyncProfile(flow_id="f", node_type="Application", platform_url=ANNAN, platform_api_key="k"), repo,
        )
    assert anrop == []


@pytest.mark.asyncio
async def test_synkfel_visar_inte_plattformens_svar(repo, monkeypatch):
    _falsk_plattform(monkeypatch, sync_module, _Svar(500, text="Traceback: intern-hemlighet"))
    with pytest.raises(sync_module.SyncError) as fel:
        await sync_module._run_sync(sync_module.SyncProfile(flow_id="f", node_type="Application"), repo)
    assert "intern-hemlighet" not in str(fel.value) and "500" in str(fel.value)


# ── Import ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
@pytest.mark.parametrize("vag,extra", [
    ("sources", {}),
    ("sources/fields", {"flow_id": "f"}),
    ("execute", {"flow_id": "f", "node_type": "Application", "mappings": [{"source_field": "n", "target": "name"}]}),
])
async def test_import_mot_otillaten_adress_avvisas_utan_anrop(client, api_headers, monkeypatch, vag, extra):
    """REGRESSION: importen kunde få servern att anropa vilken adress som helst."""
    anrop = _falsk_plattform(monkeypatch, platform_import, _Svar(200, []))
    resp = await client.post(
        f"/api/v1/import/platform/{vag}",
        json={"platform_url": "http://169.254.169.254/latest", "platform_api_key": "k", **extra},
        headers=api_headers,
    )
    assert resp.status_code == 422
    assert anrop == []


@pytest.mark.asyncio
async def test_kallor_bara_i_den_form_guiden_anvander(client, api_headers, monkeypatch):
    kalla = {"flow_id": "f", "flow_name": "Systemlistan", "connector_type": "sharepoint",
             "record_count": 3, "last_sync": None, "status": "ok", "intern": "hemligt"}
    _falsk_plattform(monkeypatch, platform_import, _Svar(200, [kalla]))
    resp = await client.post("/api/v1/import/platform/sources", json={"platform_api_key": "k"}, headers=api_headers)
    assert resp.status_code == 200
    assert resp.json() == [{k: v for k, v in kalla.items() if k != "intern"}]


@pytest.mark.asyncio
@pytest.mark.parametrize("vag,extra", [("sources", {}), ("sources/fields", {"flow_id": "f"})])
async def test_plattformens_felkropp_nar_inte_klienten(client, api_headers, monkeypatch, vag, extra):
    """REGRESSION: plattformens felsvar (resp.text) skickades vidare till klienten."""
    _falsk_plattform(monkeypatch, platform_import, _Svar(401, text="intern-detalj från plattformen"))
    resp = await client.post(
        f"/api/v1/import/platform/{vag}", json={"platform_api_key": "k", **extra}, headers=api_headers,
    )
    assert resp.status_code == 502
    assert "intern-detalj" not in resp.text and "401" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_maskerad_nyckel_for_falt_anvander_profilens_tillatna_adress(client, api_headers, monkeypatch):
    sync_module._save_profiles({"f": sync_module.SyncProfile(
        flow_id="f", node_type="Application", platform_url=ANNAN, platform_api_key="profilens",
    )})
    anrop = _falsk_plattform(monkeypatch, platform_import, _Svar(200, {"records": [], "total": 0}))
    body = {"platform_api_key": "••••ens", "flow_id": "f"}
    # Profilen pekar på en adress som inte (längre) är tillåten.
    resp = await client.post("/api/v1/import/platform/sources/fields", json=body, headers=api_headers)
    assert resp.status_code == 422 and anrop == []

    monkeypatch.setenv("INTEGRATION_PLATFORM_ALLOWED_URLS", ANNAN)
    resp = await client.post("/api/v1/import/platform/sources/fields", json=body, headers=api_headers)
    assert resp.status_code == 200
    assert anrop == [{"url": f"{ANNAN}/data/f/records", "key": "profilens"}]
