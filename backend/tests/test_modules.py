"""Valfria moduler: väljs vid installation, slås på och av av administratören.

Kontraktet som låses här:
- Utan val (MODULES tom) har installationen bara kärnan; MODULES=all ger alla.
- Ett val under Administration → Organisation gäller före miljön; en tom
  lista betyder inga moduler, inte "använd miljön".
- En avstängd moduls API svarar 404; kärnan svarar alltid.
- Modulerna som är på syns utan inloggning (webben behöver dem före inloggning).
"""
import pytest
from sqlalchemy import delete

from app import modules
from app.config import settings
from app.models.org_settings import OrgSettingsORM
from app.services import org_settings

# En sökväg per router i varje modul.
PATHS = {
    "calendar": ["/api/v1/calendar/events", "/api/v1/change-log/permissions"],
    "collaboration": ["/api/v1/workspaces"],
    "governance": [
        "/api/v1/principles", "/api/v1/principle-document", "/api/v1/target-architecture",
        "/api/v1/nulaagesanalys", "/api/v1/gap-analys", "/api/v1/gap-tasks",
    ],
    "glossary": ["/api/v1/glossary"],
    "surveys": ["/api/v1/surveys", "/api/v1/my-surveys", "/api/v1/published-reports"],
    "arkitekten": ["/api/v1/arkflows"],
}


@pytest.fixture(autouse=True)
def _plattformen_finns(monkeypatch):
    """Modulen Arkitekten kräver Integrationsplattformen (beslut B1). Testerna
    här prövar varje modul som en installation med plattformen; det som
    händer utan den prövas för sig (test_arkitekten_requires_the_platform)."""
    monkeypatch.setenv("INTEGRATION_PLATFORM_URL", "http://plattform-api:8000/api/v1")


@pytest.fixture(autouse=True)
async def _inga_satta_moduler(repo):
    async def rensa():
        async with repo._session_factory() as s:
            await s.execute(delete(OrgSettingsORM))
            await s.commit()
        await org_settings.load(repo._session_factory)

    await rensa()
    yield
    await rensa()


async def _svarar(client, headers, path: str) -> bool:
    """Modulen släpper igenom anropet (svaret kan ändå vara 404 för något som
    saknas, t.ex. ett dokument som inte finns i testdatabasen)."""
    resp = await client.get(path, headers=headers)
    return not (resp.status_code == 404 and resp.json().get("detail") == "Modulen är inte aktiverad")


@pytest.fixture
async def admin(repo):
    """En inloggad administratör; API-nyckelns systemanvändare har inget
    användar-id och passar inte alla endpoints (t.ex. Mina enkäter)."""
    from uuid import uuid4

    from app.auth import issue_local_token

    user = await repo.create_local_user(
        name="admin", email=f"modul.admin.{uuid4().hex[:8]}@example.org", password_hash="x", role="admin",
    )
    return {"Authorization": f"Bearer {issue_local_token(user)}"}


def test_varje_modul_har_en_sokvag():
    assert set(PATHS) == set(modules.KEYS)


@pytest.mark.asyncio
async def test_utan_val_bara_karnan(client, admin, monkeypatch):
    monkeypatch.setattr(settings, "MODULES", "")
    assert (await client.get("/api/v1/org-settings/public")).json()["modules"] == []
    for path in [p for paths in PATHS.values() for p in paths]:
        resp = await client.get(path, headers=admin)
        assert resp.status_code == 404 and resp.json()["detail"] == "Modulen är inte aktiverad", path
    assert (await client.get("/api/v1/nodes", headers=admin)).status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize("modul", modules.KEYS)
async def test_en_modul_i_taget(client, admin, monkeypatch, modul):
    monkeypatch.setattr(settings, "MODULES", modul)
    for key, paths in PATHS.items():
        for path in paths:
            assert await _svarar(client, admin, path) == (key == modul), path


@pytest.mark.asyncio
async def test_all_och_okanda_nycklar(client, monkeypatch):
    monkeypatch.setattr(settings, "MODULES", "all")
    assert (await client.get("/api/v1/org-settings/public")).json()["modules"] == list(modules.KEYS)
    monkeypatch.setattr(settings, "MODULES", " Surveys , okänd,calendar")
    assert (await client.get("/api/v1/org-settings/public")).json()["modules"] == ["calendar", "surveys"]
    assert modules.unknown(settings.MODULES) == ["okänd"]


@pytest.mark.asyncio
async def test_admin_slar_pa_och_av(client, api_headers, monkeypatch):
    monkeypatch.setattr(settings, "MODULES", "all")

    resp = await client.put("/api/v1/org-settings", json={"modules": ["surveys", "glossary"]}, headers=api_headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["values"]["modules"] == ["glossary", "surveys"]
    assert data["defaults"]["modules"] == list(modules.KEYS)
    assert [m["key"] for m in data["module_catalog"]] == list(modules.KEYS)
    assert await _svarar(client, api_headers, "/api/v1/glossary")
    assert not await _svarar(client, api_headers, "/api/v1/calendar/events")

    # En tom lista är ett val: inga moduler, trots att miljön säger alla.
    await client.put("/api/v1/org-settings", json={"modules": []}, headers=api_headers)
    assert (await client.get("/api/v1/org-settings/public")).json()["modules"] == []

    # Andra inställningar rör inte modulvalet.
    await client.put("/api/v1/org-settings", json={"org_name": "Exempel"}, headers=api_headers)
    assert (await client.get("/api/v1/org-settings/public")).json()["modules"] == []

    # null = tillbaka till installationens val.
    await client.put("/api/v1/org-settings", json={"modules": None}, headers=api_headers)
    assert (await client.get("/api/v1/org-settings/public")).json()["modules"] == list(modules.KEYS)


@pytest.mark.asyncio
@pytest.mark.parametrize("varde", [["okänd"], "calendar", [1]])
async def test_ogiltigt_modulval_avvisas(client, api_headers, varde):
    resp = await client.put("/api/v1/org-settings", json={"modules": varde}, headers=api_headers)
    assert resp.status_code == 422
    assert (await client.get("/api/v1/org-settings", headers=api_headers)).json()["values"]["modules"] is None


@pytest.mark.asyncio
async def test_bara_admin_valjer_moduler(client, repo):
    from app.auth import issue_local_token

    user = await repo.create_local_user(name="red", email="modul.redaktor@example.org", password_hash="x", role="superuser")
    headers = {"Authorization": f"Bearer {issue_local_token(user)}"}
    assert (await client.put("/api/v1/org-settings", json={"modules": []}, headers=headers)).status_code == 403


# ── Korsberoenden ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_kommentarer_foljer_amnets_modul(client, admin, monkeypatch):
    monkeypatch.setattr(settings, "MODULES", "all")
    princip = await client.post(
        "/api/v1/comments", json={"subject_type": "principle", "subject_id": "AP-X", "body": "Bra"}, headers=admin,
    )
    begrepp = await client.post(
        "/api/v1/comments", json={"subject_type": "glossary_term", "subject_id": "Term", "body": "Oklart"},
        headers=admin,
    )
    assert princip.status_code == begrepp.status_code == 201

    monkeypatch.setattr(settings, "MODULES", "glossary")
    assert (await client.get("/api/v1/comments", params={"subject_type": "principle"}, headers=admin)).status_code == 404
    assert (await client.post(
        "/api/v1/comments", json={"subject_type": "principle", "subject_id": "AP-X", "body": "Igen"}, headers=admin,
    )).status_code == 404
    assert (await client.delete(f"/api/v1/comments/{princip.json()['id']}", headers=admin)).status_code == 404
    assert (await client.get("/api/v1/comments", params={"subject_type": "glossary_term"}, headers=admin)).status_code == 200

    kommentarer = (await client.get("/api/v1/admin/notifications", headers=admin)).json()["pending_comments"]
    ids = {c["id"] for c in kommentarer}
    assert begrepp.json()["id"] in ids and princip.json()["id"] not in ids


@pytest.mark.asyncio
async def test_notiser_fran_avstangda_moduler_visas_inte(client, admin, monkeypatch):
    monkeypatch.setattr(settings, "MODULES", "all")
    resp = await client.post("/api/v1/glossary/requests", json={"term": "Modulbegrepp", "context": None}, headers=admin)
    assert resp.status_code in (200, 201), resp.text

    def termer(data):
        return [r["term"] for r in data["glossary_requests"]]

    assert "Modulbegrepp" in termer((await client.get("/api/v1/admin/notifications", headers=admin)).json())
    monkeypatch.setattr(settings, "MODULES", "calendar")
    data = (await client.get("/api/v1/admin/notifications", headers=admin)).json()
    assert termer(data) == [] and data["surveys_pending_review"] == []
    monkeypatch.setattr(settings, "MODULES", "")
    assert (await client.get("/api/v1/admin/notifications", headers=admin)).json()["calendar_proposals"] == []


@pytest.mark.asyncio
async def test_sok_hittar_principer_bara_med_arkitekturstyrning(client, admin, repo, monkeypatch):
    from app.schemas.common import NodeType
    from app.schemas.node import NodeCreate

    await repo.create_node(NodeCreate(type=NodeType.ARCHITECTURE_PRINCIPLE, name="Modulsökprincip",
                                      attributes={"identifier": "AP-SOK"}))
    await repo.create_node(NodeCreate(type=NodeType.APPLICATION, name="Modulsöksystem"))

    async def typer():
        resp = await client.get("/api/v1/search", params={"q": "Modulsök"}, headers=admin)
        return {n["type"] for n in resp.json()}

    monkeypatch.setattr(settings, "MODULES", "governance")
    assert await typer() == {"ArchitecturePrinciple", "Application"}
    monkeypatch.setattr(settings, "MODULES", "")
    assert await typer() == {"Application"}


def test_arkitekten_requires_the_platform(monkeypatch):
    """B1: Arkitekten's diagrams reach the portal only through the Integration
    Platform, so the module cannot be on in an installation without it."""
    from app import modules

    monkeypatch.delenv("INTEGRATION_PLATFORM_URL", raising=False)
    assert "Integrationsplattformen" in (modules.unavailable_reason("arkitekten") or "")
    assert modules.unavailable_reason("glossary") is None
    monkeypatch.setenv("INTEGRATION_PLATFORM_URL", "http://plattform-api:8000/api/v1")
    assert modules.unavailable_reason("arkitekten") is None
