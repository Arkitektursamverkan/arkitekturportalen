"""Arkitekturresan: redigerbara steg i stället för fyra fasta.

Kontraktet som låses här:
- Utan sparat innehåll visas de inbyggda stegen (is_default).
- Redaktörer sparar och återställer; övriga läser.
- Ett steg länkar bara till sidor i portalen, ids är unika och
  stämplarna gäller bara de fyra dokumenten.
- Resan följer med i innehållspaket när den är sparad.
"""
import pytest
from sqlalchemy import delete

from app.auth import issue_local_token
from app.models.architecture_journey import ArchitectureJourneyORM
from app.services import content_pack as cp

EGEN = {
    "title": "Vår arkitekturresa",
    "intro": "Så arbetar vi.",
    "steps": [
        {"id": "inventera", "title": "Inventera processerna", "subtitle": "Vad gör vi?", "icon": "account_tree",
         "body": "Börja med **processerna**.", "link_path": "/processes", "link_label": "Öppna processer"},
        {"id": "mal", "title": "Målarkitektur", "link_path": "/target-architecture", "document": "target_architecture"},
    ],
}


@pytest.fixture(autouse=True)
async def _standardresan(repo):
    async def rensa():
        async with repo._session_factory() as s:
            await s.execute(delete(ArchitectureJourneyORM))
            await s.commit()

    await rensa()
    yield
    await rensa()


async def _anvandare(repo, roll: str, epost: str) -> dict:
    user = await repo.create_local_user(name=epost, email=epost, password_hash="x", role=roll)
    return {"Authorization": f"Bearer {issue_local_token(user)}"}


@pytest.mark.asyncio
async def test_standard_och_spara_och_aterstall(client, repo):
    redaktor = await _anvandare(repo, "superuser", "resa.redaktor@example.org")
    data = (await client.get("/api/v1/architecture-journey", headers=redaktor)).json()
    assert data["is_default"] and [s["id"] for s in data["content"]["steps"]] == ["nulaege", "malarkitektur", "gap", "principer"]

    resp = await client.put("/api/v1/architecture-journey", json=EGEN, headers=redaktor)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert not data["is_default"] and data["updated_by"] == "resa.redaktor@example.org"
    assert data["content"]["steps"][1]["icon"] == "route"  # standardikon
    assert (await client.get("/api/v1/architecture-journey", headers=redaktor)).json()["content"]["title"] == "Vår arkitekturresa"

    data = (await client.delete("/api/v1/architecture-journey", headers=redaktor)).json()
    assert data["is_default"]


@pytest.mark.asyncio
async def test_bara_redaktorer_andrar(client, repo):
    lasare = await _anvandare(repo, "user", "resa.lasare@example.org")
    assert (await client.get("/api/v1/architecture-journey", headers=lasare)).status_code == 200
    assert (await client.put("/api/v1/architecture-journey", json=EGEN, headers=lasare)).status_code == 403
    assert (await client.delete("/api/v1/architecture-journey", headers=lasare)).status_code == 403
    assert (await client.get("/api/v1/architecture-journey")).status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize("fel", [
    {"link_path": "https://example.org"},
    {"link_path": "//example.org/x"},
    {"document": "budget"},
    {"icon": "okand"},
    {"id": "Med Mellanslag"},
])
async def test_ogiltiga_steg_avvisas(client, api_headers, fel):
    steg = {**EGEN["steps"][0], **fel}
    resp = await client.put("/api/v1/architecture-journey", json={**EGEN, "steps": [steg]}, headers=api_headers)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_samma_id_tva_ganger_avvisas(client, api_headers):
    steg = EGEN["steps"][0]
    resp = await client.put("/api/v1/architecture-journey", json={**EGEN, "steps": [steg, steg]}, headers=api_headers)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_resan_i_innehallspaket(client, api_headers, repo):
    assert "architecture-journey.json" not in await cp.export_pack(repo, "x")  # standard följer inte med
    await client.put("/api/v1/architecture-journey", json=EGEN, headers=api_headers)
    files = await cp.export_pack(repo, "x")
    assert files["architecture-journey.json"]["title"] == "Vår arkitekturresa"

    await client.delete("/api/v1/architecture-journey", headers=api_headers)
    res = await cp.import_pack(repo, files, apply=True)
    assert res["Arkitekturresan"].created == 1
    assert (await client.get("/api/v1/architecture-journey", headers=api_headers)).json()["content"]["title"] == "Vår arkitekturresa"
    assert (await cp.import_pack(repo, files, apply=True))["Arkitekturresan"].unchanged == 1
