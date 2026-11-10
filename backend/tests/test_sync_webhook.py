"""Only the Integration Platform may start a sync through the webhook.

It signs each call with the shared SYNC_WEBHOOK_SECRET (X-Webhook-Signature
over the timestamp and the body); an older platform sends the secret itself in
X-Webhook-Secret, which is still accepted with a warning. Without a configured
secret the webhook is switched off altogether."""
import hashlib
import hmac
import json
import time

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


# ── Signerade anrop (X-Webhook-Signature) ───────────────────────────────────

HEMLIGHET = "delad-hemlighet"


def _signerat(body: bytes, *, nyckel: str = HEMLIGHET, tid: int | None = None) -> dict[str, str]:
    tid = int(time.time()) if tid is None else tid
    sig = hmac.new(nyckel.encode(), f"{tid}.".encode() + body, hashlib.sha256).hexdigest()
    return {"X-Webhook-Timestamp": str(tid), "X-Webhook-Signature": f"sha256={sig}",
            "Content-Type": "application/json"}


@pytest.mark.asyncio
async def test_giltig_signatur_slapps_in(client, monkeypatch):
    monkeypatch.setattr(settings, "SYNC_WEBHOOK_SECRET", HEMLIGHET)
    body = json.dumps(PAYLOAD).encode()
    resp = await client.post("/api/v1/sync/webhook", content=body, headers=_signerat(body))
    assert resp.status_code == 200 and resp.json()["status"] == "ignored"


@pytest.mark.asyncio
async def test_fel_signatur_avvisas(client, monkeypatch):
    monkeypatch.setattr(settings, "SYNC_WEBHOOK_SECRET", HEMLIGHET)
    body = json.dumps(PAYLOAD).encode()
    # Fel nyckel, ändrad body och skräp i huvudet.
    for headers, skickad in (
        (_signerat(body, nyckel="gissning"), body),
        (_signerat(body), body.replace(b"finns-inte", b"annat-flode")),
        ({**_signerat(body), "X-Webhook-Signature": "sha256=00"}, body),
        ({**_signerat(body), "X-Webhook-Timestamp": "inte-ett-tal"}, body),
    ):
        resp = await client.post("/api/v1/sync/webhook", content=skickad, headers=headers)
        assert resp.status_code == 401, headers


@pytest.mark.asyncio
async def test_gammal_tidsstampel_avvisas(client, monkeypatch):
    """REGRESSION: ett uppsnappat anrop ska inte kunna spelas upp senare."""
    monkeypatch.setattr(settings, "SYNC_WEBHOOK_SECRET", HEMLIGHET)
    body = json.dumps(PAYLOAD).encode()
    for tid in (int(time.time()) - 400, int(time.time()) + 400):
        resp = await client.post("/api/v1/sync/webhook", content=body, headers=_signerat(body, tid=tid))
        assert resp.status_code == 401


@pytest.mark.asyncio
async def test_signatur_vinner_over_statiskt_huvud(client, monkeypatch):
    """Finns en signatur avgör den – en rätt hemlighet bredvid en fel signatur räcker inte."""
    monkeypatch.setattr(settings, "SYNC_WEBHOOK_SECRET", HEMLIGHET)
    body = json.dumps(PAYLOAD).encode()
    headers = {**_signerat(body, nyckel="gissning"), "X-Webhook-Secret": HEMLIGHET}
    assert (await client.post("/api/v1/sync/webhook", content=body, headers=headers)).status_code == 401


@pytest.mark.asyncio
async def test_statiskt_huvud_godkanns_men_varnar(client, monkeypatch):
    """En äldre plattform skickar hemligheten själv: fortfarande in, men med en varning."""
    from app.api.v1 import sync as sync_module

    varningar: list[str] = []
    monkeypatch.setattr(sync_module.log, "warning", lambda event, **_kw: varningar.append(event))
    monkeypatch.setattr(settings, "SYNC_WEBHOOK_SECRET", HEMLIGHET)
    resp = await client.post("/api/v1/sync/webhook", json=PAYLOAD, headers={"X-Webhook-Secret": HEMLIGHET})
    assert resp.status_code == 200
    assert "sync.webhook_static_secret" in varningar
