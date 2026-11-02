"""Organisationsinställningar under Administration.

Kontraktet som låses här:
- Ett värde som inte är satt i databasen hämtas från miljön, så en
  installation som konfigurerats via .env fungerar som förut.
- Satta värden gäller i stället för miljön: e-postdomäner vid inloggning och
  katalogsynk, avdelningar i förändringsloggen.
- Namn, färg och logotyp läses utan inloggning (inloggningssidan visar dem);
  resten är bara för administratörer.
- Logotypens typ avgörs av innehållet, och en SVG kan inte köra skript.
"""
import pytest
from sqlalchemy import delete

from app.auth import issue_local_token
from app.config import settings
from app.models.directory import DirectoryPersonORM
from app.models.org_settings import OrgSettingsORM
from app.services import org_settings
from app.services.pdf import renderer

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
SVG = b'<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'


@pytest.fixture(autouse=True)
async def _tomma_installningar(repo, monkeypatch):
    monkeypatch.setattr(settings, "PDF_ORG_NAME", "Miljöbolaget")
    monkeypatch.setattr(settings, "ALLOWED_EMAIL_DOMAINS", "example.net")
    monkeypatch.setattr(settings, "CHANGE_LOG_DEPARTMENTS", "IT- och Informationsarkitektur")

    async def rensa():
        async with repo._session_factory() as s:
            await s.execute(delete(OrgSettingsORM))
            await s.commit()
        await org_settings.load(repo._session_factory)

    await rensa()
    yield
    await rensa()


async def _anvandare(repo, roll: str, epost: str) -> dict:
    user = await repo.create_local_user(name=epost, email=epost, password_hash="x", role=roll)
    return {"Authorization": f"Bearer {issue_local_token(user)}"}


@pytest.mark.asyncio
async def test_osatt_varde_hamtas_fran_miljon(client, api_headers):
    data = (await client.get("/api/v1/org-settings", headers=api_headers)).json()
    assert data["values"]["org_name"] is None
    assert data["defaults"]["org_name"] == "Miljöbolaget"
    assert data["defaults"]["allowed_email_domains"] == "example.net"

    public = (await client.get("/api/v1/org-settings/public")).json()
    assert {k: v for k, v in public.items() if k not in ("modules", "navigation", "domain_lists")} == {
        "org_name": "Miljöbolaget", "org_short_name": "Miljöbolaget", "brand_color": None, "logo_version": None,
    }
    assert org_settings.email_domain_allowed("kim@example.net")
    assert not org_settings.email_domain_allowed("kim@example.org")


@pytest.mark.asyncio
async def test_satta_varden_galler_och_tomt_aterstaller(client, api_headers):
    resp = await client.put(
        "/api/v1/org-settings",
        json={
            "org_name": "  Exempelkommunen ",
            "org_short_name": "EK",
            "brand_color": "#e55b2c",
            "allowed_email_domains": "Example.org, @exempel.se, example.org",
        },
        headers=api_headers,
    )
    assert resp.status_code == 200, resp.text
    values = resp.json()["values"]
    assert values["org_name"] == "Exempelkommunen"
    assert values["brand_color"] == "#E55B2C"
    assert values["allowed_email_domains"] == "example.org,exempel.se"
    # Fält som inte skickades lämnas orörda (fortfarande osatta).
    assert values["change_log_departments"] is None

    assert org_settings.email_domain_allowed("kim@exempel.se")
    assert not org_settings.email_domain_allowed("kim@example.net")
    public = (await client.get("/api/v1/org-settings/public")).json()
    assert public["org_short_name"] == "EK" and public["brand_color"] == "#E55B2C"

    # Tomt värde = tillbaka till miljön.
    resp = await client.put("/api/v1/org-settings", json={"allowed_email_domains": " "}, headers=api_headers)
    assert resp.json()["values"]["allowed_email_domains"] is None
    assert resp.json()["values"]["org_name"] == "Exempelkommunen"
    assert org_settings.email_domain_allowed("kim@example.net")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "falt",
    [{"brand_color": "orange"}, {"brand_color": "#12345"}, {"allowed_email_domains": "example.net, inte en domän"}],
)
async def test_ogiltiga_varden_avvisas(client, api_headers, falt):
    resp = await client.put("/api/v1/org-settings", json=falt, headers=api_headers)
    assert resp.status_code == 422
    assert (await client.get("/api/v1/org-settings", headers=api_headers)).json()["values"] == {
        "org_name": None, "org_short_name": None, "brand_color": None,
        "allowed_email_domains": None, "change_log_departments": None, "anonymous_read": None, "modules": None,
    }


@pytest.mark.asyncio
async def test_bara_admin_ser_och_andrar(client, repo):
    vanlig = await _anvandare(repo, "superuser", "sam.superuser@example.net")
    assert (await client.get("/api/v1/org-settings")).status_code == 401
    assert (await client.get("/api/v1/org-settings", headers=vanlig)).status_code == 403
    assert (await client.put("/api/v1/org-settings", json={"org_name": "X"}, headers=vanlig)).status_code == 403
    assert (
        await client.put("/api/v1/org-settings/logo", files={"file": ("l.png", PNG, "image/png")}, headers=vanlig)
    ).status_code == 403
    assert (await client.get("/api/v1/org-settings/public")).status_code == 200


@pytest.mark.asyncio
async def test_avdelningar_i_forandringsloggen_fran_installningarna(client, api_headers, repo):
    epost = "hanna.hr@example.net"
    headers = await _anvandare(repo, "user", epost)
    async with repo._session_factory() as s:
        await s.execute(delete(DirectoryPersonORM).where(DirectoryPersonORM.email == epost))
        s.add(DirectoryPersonORM(entra_oid=f"oid-{epost}", name="Hanna", email=epost, department="HR"))
        await s.commit()

    async def far() -> bool:
        return (await client.get("/api/v1/change-log/permissions", headers=headers)).json()["can_manage"]

    assert not await far()
    await client.put("/api/v1/org-settings", json={"change_log_departments": "hr, Ekonomi"}, headers=api_headers)
    assert await far()


@pytest.mark.asyncio
async def test_logotyp(client, api_headers):
    assert (await client.get("/api/v1/org-settings/logo")).status_code == 404

    resp = await client.put(
        "/api/v1/org-settings/logo", files={"file": ("logo.svg", PNG, "image/svg+xml")}, headers=api_headers,
    )
    assert resp.status_code == 200 and resp.json()["has_logo"]
    logo = await client.get("/api/v1/org-settings/logo")
    # Typen kommer från innehållet, inte från det klienten påstår.
    assert logo.headers["content-type"] == "image/png" and logo.content == PNG
    assert (await client.get("/api/v1/org-settings/public")).json()["logo_version"]

    await client.put("/api/v1/org-settings/logo", files={"file": ("l.svg", SVG, "image/svg+xml")}, headers=api_headers)
    logo = await client.get("/api/v1/org-settings/logo")
    assert logo.headers["content-type"] == "image/svg+xml"
    assert "sandbox" in logo.headers["content-security-policy"]

    for fel in (b"GIF89a....", b"\x89PNG\r\n\x1a\n" + b"\x00" * org_settings.LOGO_MAX_BYTES):
        resp = await client.put(
            "/api/v1/org-settings/logo", files={"file": ("l.png", fel, "image/png")}, headers=api_headers,
        )
        assert resp.status_code == 422

    resp = await client.delete("/api/v1/org-settings/logo", headers=api_headers)
    assert not resp.json()["has_logo"]
    assert (await client.get("/api/v1/org-settings/logo")).status_code == 404
    assert (await client.get("/api/v1/org-settings/public")).json()["logo_version"] is None


def _rapport_html() -> str:
    report = {"name": "Rapport", "survey_title": "Enkät", "matching_count": 0, "answered_count": 0, "rows": []}
    return renderer._jinja_env.get_template("survey_report.html").render(
        report=report, generated_date="", css_url="", **renderer._branding(),
    )


@pytest.mark.asyncio
async def test_pdf_far_namn_logotyp_och_farg_fran_installningarna(client, api_headers):
    html = _rapport_html()
    # Ingen logotyp satt: ingen bild, standardfärgen.
    assert "<img" not in html
    assert f"--brand-color: {renderer.DEFAULT_BRAND_COLOR};" in html

    await client.put("/api/v1/org-settings", json={"brand_color": "#E55B2C"}, headers=api_headers)
    await client.put("/api/v1/org-settings/logo", files={"file": ("l.png", PNG, "image/png")}, headers=api_headers)
    html = _rapport_html()
    assert "--brand-color: #E55B2C;" in html
    assert 'src="data:image/png;base64,' in html
    assert 'alt="Miljöbolaget"' in html

