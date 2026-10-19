"""Redigerbara textblock (Om EA-portalen, arbetsgruppernas syfte och uppdrag).

Kontraktet som låses här:
- Alla inloggade läser blocken; redaktörer och administratörer skriver.
- Ett block som inte finns skapas när det sparas första gången, så en ny
  installation börjar utan text och fyller i den själv.
"""
import pytest

from app.auth import issue_local_token


async def _anvandare(repo, roll: str, epost: str) -> dict:
    user = await repo.create_local_user(name=epost, email=epost, password_hash="x", role=roll)
    return {"Authorization": f"Bearer {issue_local_token(user)}"}


@pytest.mark.asyncio
async def test_uppdraget_skapas_av_redaktor_och_lases_av_alla(client, repo):
    redaktor = await _anvandare(repo, "superuser", "rut.redaktor@example.org")
    lasare = await _anvandare(repo, "user", "lasse.lasare@example.org")
    text = "#### Syfte\n\nGemensamt forum.\n\n**1. Dela information**\n- ändringar"

    nekad = await client.put("/api/v1/home-blocks/workgroup_charter", json={"body": "x", "enabled": True}, headers=lasare)
    assert nekad.status_code == 403

    resp = await client.put("/api/v1/home-blocks/workgroup_charter", json={"body": text, "enabled": True}, headers=redaktor)
    assert resp.status_code == 200
    assert resp.json()["updated_by"] == "rut.redaktor@example.org"

    blocks = (await client.get("/api/v1/home-blocks", headers=lasare)).json()["blocks"]
    assert {b["key"]: b["body"] for b in blocks}["workgroup_charter"] == text
