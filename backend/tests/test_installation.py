"""The installation's shared settings (GET/PUT /api/v1/installation, client-config)
and the portal address learned from requests."""
from __future__ import annotations

import pytest

from app.config import settings
from app.services import installation
from app.services.pdf.renderer import source_url_for_document


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    installation.reset()
    monkeypatch.setattr(settings, "PDF_APP_BASE_URL", "")
    monkeypatch.setattr(settings, "ENTRA_TENANT_ID", "")
    monkeypatch.setattr(settings, "ENTRA_CLIENT_ID", "")
    monkeypatch.setattr(settings, "ENTRA_CLIENT_SECRET", "")
    monkeypatch.setattr(settings, "BOOTSTRAP_ADMIN_EMAILS", "")
    monkeypatch.setattr(settings, "SYNC_WEBHOOK_SECRET", "delad-hemlighet-for-test-0123456789")
    yield
    installation.reset()


def _entra(monkeypatch):
    monkeypatch.setattr(settings, "ENTRA_TENANT_ID", "tenant-1")
    monkeypatch.setattr(settings, "ENTRA_CLIENT_ID", "client-1")
    monkeypatch.setattr(settings, "ENTRA_CLIENT_SECRET", "hemligt")
    monkeypatch.setattr(settings, "BOOTSTRAP_ADMIN_EMAILS", "Admin@Example.org")


# ── Who may read ────────────────────────────────────────────────────────────

async def test_installation_requires_credentials(client):
    r = await client.get("/api/v1/installation")
    assert r.status_code == 401
    r = await client.get("/api/v1/installation", headers={"X-Installation-Secret": "fel"})
    assert r.status_code == 401


async def test_installation_secret_closed_when_webhook_secret_empty(client, monkeypatch):
    monkeypatch.setattr(settings, "SYNC_WEBHOOK_SECRET", "")
    r = await client.get("/api/v1/installation", headers={"X-Installation-Secret": ""})
    assert r.status_code == 401


async def test_api_key_gets_client_secret(client, api_headers, monkeypatch):
    _entra(monkeypatch)
    r = await client.get("/api/v1/installation", headers=api_headers)
    assert r.status_code == 200
    assert r.headers["cache-control"] == "no-store"
    entra = r.json()["entra"]
    assert entra == {
        "tenant_id": "tenant-1",
        "client_id": "client-1",
        "api_scope": "api://client-1/access_as_user",
        "bootstrap_admin_emails": ["admin@example.org"],
        "client_secret": "hemligt",
    }


async def test_webhook_secret_gets_everything_but_client_secret(client, monkeypatch):
    _entra(monkeypatch)
    r = await client.get(
        "/api/v1/installation", headers={"X-Installation-Secret": settings.SYNC_WEBHOOK_SECRET}
    )
    assert r.status_code == 200
    entra = r.json()["entra"]
    assert entra["client_id"] == "client-1"
    assert "client_secret" not in entra


async def test_entra_null_without_registration(client, api_headers):
    r = await client.get("/api/v1/installation", headers=api_headers)
    assert r.json() == {"portal_url": None, "arkitekten_url": None, "entra": None}


# ── Arkitekten registers ────────────────────────────────────────────────────

async def test_arkitekten_registers_and_web_sees_it(client, api_headers):
    r = await client.put(
        "/api/v1/installation/arkitekten", json={"url": "https://ark.example.org/"}, headers=api_headers
    )
    assert r.status_code == 200
    assert r.json()["arkitekten_url"] == "https://ark.example.org"
    r = await client.get("/api/v1/client-config")
    assert r.status_code == 200
    assert r.json()["arkitekten_url"] == "https://ark.example.org"


async def test_registration_needs_api_key(client):
    r = await client.put(
        "/api/v1/installation/arkitekten",
        json={"url": "https://ark.example.org"},
        headers={"X-Installation-Secret": settings.SYNC_WEBHOOK_SECRET},
    )
    assert r.status_code == 401


@pytest.mark.parametrize(
    "url", ["javascript:alert(1)", "ftp://ark.example.org", "https://", "https://a.example.org/?x=1",
            "https://user:pw@a.example.org", "x" * 400]
)
async def test_registration_rejects_bad_urls(client, api_headers, url):
    r = await client.put("/api/v1/installation/arkitekten", json={"url": url}, headers=api_headers)
    assert r.status_code == 422


async def test_registration_is_stored(repo, api_headers, client):
    await installation.load(repo._session_factory)
    await client.put(
        "/api/v1/installation/arkitekten", json={"url": "https://ark2.example.org"}, headers=api_headers
    )
    installation.reset()
    await installation.load(repo._session_factory)
    assert installation.arkitekten_url() == "https://ark2.example.org"


# ── The SPA's settings ──────────────────────────────────────────────────────

async def test_client_config_is_public_and_has_no_secret(client, monkeypatch):
    _entra(monkeypatch)
    r = await client.get("/api/v1/client-config")
    assert r.status_code == 200
    body = r.json()
    assert body["entra_tenant_id"] == "tenant-1"
    assert body["entra_api_scope"] == "api://client-1/access_as_user"
    assert "hemligt" not in r.text
    assert "admin@example.org" not in r.text.lower()


# ── The portal's own address ────────────────────────────────────────────────

async def test_address_learned_from_proxied_request(client):
    await client.get(
        "/api/v1/client-config",
        headers={"Host": "portal.example.org", "X-Forwarded-Proto": "https"},
    )
    assert installation.portal_url() == "https://portal.example.org"
    assert source_url_for_document("glossary") == "https://portal.example.org/glossary"


@pytest.mark.parametrize(
    "host", ["portal-api-y5la:8000", "10.0.3.4:8000", "localhost", "[::1]:8000", "test", "evil.example.org:x"]
)
async def test_internal_hosts_are_not_learned(client, host):
    await client.get("/api/v1/client-config", headers={"Host": host, "X-Forwarded-Proto": "https"})
    assert installation.portal_url() is None


async def test_configured_address_wins(client, monkeypatch):
    monkeypatch.setattr(settings, "PDF_APP_BASE_URL", "https://fast.example.org/")
    await client.get("/api/v1/client-config", headers={"Host": "annan.example.org"})
    assert installation.portal_url() == "https://fast.example.org"


async def test_custom_domain_not_replaced_by_platform_address():
    await installation.learn_portal_url("portal.example.org", "https")
    await installation.learn_portal_url("portal-web-abcd.onrender.com", "https")
    assert installation.portal_url() == "https://portal.example.org"
    # …but a custom domain replaces the platform's address.
    installation.reset()
    await installation.learn_portal_url("portal-web-abcd.onrender.com", "https")
    await installation.learn_portal_url("portal.example.org", "https")
    assert installation.portal_url() == "https://portal.example.org"


async def test_http_does_not_replace_https_for_same_host():
    await installation.learn_portal_url("portal.example.org", "https")
    await installation.learn_portal_url("portal.example.org", None)
    assert installation.portal_url() == "https://portal.example.org"
