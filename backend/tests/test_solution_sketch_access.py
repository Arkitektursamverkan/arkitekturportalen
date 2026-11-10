"""Vem får ändra en lösningsskiss.

- Skaparen eller en redaktör (superuser/admin) medan skissen är utkast eller
  under granskning.
- Bara admin godkänner/arkiverar – och bara admin ändrar en godkänd eller
  arkiverad skiss, också för att flytta tillbaka den.
"""
import pytest

from app.auth import issue_local_token


async def _anvandare(repo, epost: str, roll: str = "user") -> dict:
    user = await repo.create_local_user(name=epost.split("@")[0], email=epost, password_hash="x", role=roll)
    return {"Authorization": f"Bearer {issue_local_token(user)}"}


async def _skiss(client, headers) -> str:
    resp = await client.post("/api/v1/solution-sketches", json={"title": "Ny e-tjänst"}, headers=headers)
    assert resp.status_code == 201
    return resp.json()["id"]


@pytest.mark.asyncio
async def test_bara_skaparen_eller_redaktor_andrar(client, repo):
    """REGRESSION: vilken inloggad användare som helst kunde ändra andras skisser."""
    skapare = await _anvandare(repo, "skiss.skapare@example.org")
    annan = await _anvandare(repo, "skiss.annan@example.org")
    redaktor = await _anvandare(repo, "skiss.redaktor@example.org", "superuser")
    skiss = await _skiss(client, skapare)
    url = f"/api/v1/solution-sketches/{skiss}"

    assert (await client.patch(url, json={"title": "Kapad"}, headers=annan)).status_code == 403
    assert (await client.patch(url, json={"status": "in_review"}, headers=annan)).status_code == 403
    assert (await client.patch(url, json={"title": "Bättre titel"}, headers=skapare)).status_code == 200
    assert (await client.patch(url, json={"status": "in_review"}, headers=skapare)).status_code == 200
    assert (await client.patch(url, json={"description": "Granskad"}, headers=redaktor)).status_code == 200
    assert (await client.patch(url, json={"status": "draft"}, headers=skapare)).status_code == 200


@pytest.mark.asyncio
async def test_godkand_skiss_ar_last_for_alla_utom_admin(client, repo):
    skapare = await _anvandare(repo, "last.skapare@example.org")
    redaktor = await _anvandare(repo, "last.redaktor@example.org", "superuser")
    admin = await _anvandare(repo, "last.admin@example.org", "admin")
    skiss = await _skiss(client, skapare)
    url = f"/api/v1/solution-sketches/{skiss}"

    # Bara admin godkänner.
    assert (await client.patch(url, json={"status": "approved"}, headers=redaktor)).status_code == 403
    assert (await client.patch(url, json={"status": "approved"}, headers=admin)).status_code == 200
    # Godkänd: varken skaparen eller en redaktör ändrar eller flyttar tillbaka.
    for headers in (skapare, redaktor):
        assert (await client.patch(url, json={"title": "Ändrad"}, headers=headers)).status_code == 403
        assert (await client.patch(url, json={"status": "draft"}, headers=headers)).status_code == 403
    assert (await client.patch(url, json={"status": "archived"}, headers=admin)).status_code == 200
    assert (await client.patch(url, json={"status": "draft"}, headers=admin)).status_code == 200


@pytest.mark.asyncio
async def test_okand_skiss_ger_404(client, repo):
    skapare = await _anvandare(repo, "okand.skapare@example.org")
    resp = await client.patch(
        "/api/v1/solution-sketches/00000000-0000-0000-0000-000000000000", json={"title": "x"}, headers=skapare,
    )
    assert resp.status_code == 404
