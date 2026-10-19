"""Only the Integration Platform may start a sync through the webhook.

It proves itself with the shared SYNC_WEBHOOK_SECRET in X-Webhook-Secret.
Without a configured secret the webhook is switched off altogether."""
import pytest

from app.config import settings

PAYLOAD = {"event": "flow.execution.success", "flow_id": "finns-inte"}


@pytest.mark.asyncio
async def test_avstangd_utan_hemlighet(client, monkeypatch):
    monkeypatch.setattr(settings, "SYNC_WEBHOOK_SECRET", "")
    resp = await client.post("/api/v1/sync/webhook", json=PAYLOAD, headers={"X-Webhook-Secret": ""})
    assert resp.status_code == 503


@pytest.mark.asyncio
@pytest.mark.parametrize("headers", [{}, {"X-Webhook-Secret": "gissning"}])
async def test_fel_eller_saknad_hemlighet_avvisas(client, monkeypatch, headers):
    monkeypatch.setattr(settings, "SYNC_WEBHOOK_SECRET", "delad-hemlighet")
    resp = await client.post("/api/v1/sync/webhook", json=PAYLOAD, headers=headers)
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_ratt_hemlighet_slapps_in(client, monkeypatch):
    monkeypatch.setattr(settings, "SYNC_WEBHOOK_SECRET", "delad-hemlighet")
    resp = await client.post(
        "/api/v1/sync/webhook", json=PAYLOAD, headers={"X-Webhook-Secret": "delad-hemlighet"},
    )
    # Släppt förbi kontrollen; flödet saknar profil och ignoreras.
    assert resp.status_code == 200 and resp.json()["status"] == "ignored"
