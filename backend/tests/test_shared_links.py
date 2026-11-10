"""Gemensamma snabblänkar på startsidan.

Kontraktet som låses här:
- Utan inställning finns inga gemensamma länkar.
- Bara administratörer lägger upp länkar; alla inloggade läser dem, i den
  ordning de lades upp.
- Adressen är http(s) eller en sökväg på samma server. Andra adresser
  (javascript:, data:, //värd) tas inte emot.
- En tom lista tar bort länkarna.
"""
import pytest
from sqlalchemy import delete

from app.auth import issue_local_token
from app.models.org_settings import OrgSettingsORM
from app.services import org_settings

URL = "/api/v1/org-settings/shared-links"


@pytest.fixture(autouse=True)
async def _tomma_installningar(repo):
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
async def test_inga_lankar_utan_installning(client, repo):
    vem = await _anvandare(repo, "user", "las-tom@example.org")
    r = await client.get(URL, headers=vem)
    assert r.status_code == 200
    assert r.json() == {"links": []}


@pytest.mark.asyncio
async def test_admin_lagger_upp_alla_laser(client, repo, api_headers):
    lankar = [
        {"title": "  Rundvisningen ", "url": "/rundvisning/", "description": "Gå den före mötet", "new_tab": False},
        {"title": "Intranätet", "url": "https://intra.example.org/start", "description": "  ", "new_tab": True},
    ]
    r = await client.put(URL, json={"links": lankar}, headers=api_headers)
    assert r.status_code == 200, r.text

    vem = await _anvandare(repo, "user", "las@example.org")
    data = (await client.get(URL, headers=vem)).json()
    assert data == {"links": [
        {"title": "Rundvisningen", "url": "/rundvisning/", "description": "Gå den före mötet", "new_tab": False},
        {"title": "Intranätet", "url": "https://intra.example.org/start", "description": None, "new_tab": True},
    ]}

    # Ligger kvar efter omladdning från databasen.
    await org_settings.load(repo._session_factory)
    assert [lnk["title"] for lnk in (await client.get(URL, headers=vem)).json()["links"]] == ["Rundvisningen", "Intranätet"]


@pytest.mark.asyncio
async def test_bara_admin_far_andra(client, repo):
    for roll, epost in (("user", "anv@example.org"), ("superuser", "super@example.org")):
        vem = await _anvandare(repo, roll, epost)
        r = await client.put(URL, json={"links": [{"title": "X", "url": "/x"}]}, headers=vem)
        assert r.status_code == 403, roll
    assert org_settings.shared_links() is None


@pytest.mark.asyncio
async def test_kraver_inloggning(client):
    assert (await client.get(URL)).status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize("url", [
    "javascript:alert(1)", "data:text/html,hej", "//evil.example.org/", "ftp://example.org/", "intra.example.org",
    "https://", "/med mellanslag",
    # REGRESSION: /\värd och styrtecken läses av webbläsaren som en annan värd.
    "/\\evil.example.org/", "/\\/evil.example.org", "https://\\evil.example.org",
    "/sida\x00", "/sida\x7f", "https://example.org/\x85x", "/\x09/evil.example.org",
])
async def test_ogiltiga_adresser(client, api_headers, url):
    r = await client.put(URL, json={"links": [{"title": "X", "url": url}]}, headers=api_headers)
    assert r.status_code == 422, url
    assert org_settings.shared_links() is None


@pytest.mark.asyncio
async def test_hogst_tolv_och_titel_kravs(client, api_headers):
    for_manga = [{"title": f"L{i}", "url": f"/l{i}"} for i in range(13)]
    assert (await client.put(URL, json={"links": for_manga}, headers=api_headers)).status_code == 422
    assert (await client.put(URL, json={"links": [{"title": "   ", "url": "/x"}]}, headers=api_headers)).status_code == 422


@pytest.mark.asyncio
async def test_tom_lista_tar_bort(client, repo, api_headers):
    await client.put(URL, json={"links": [{"title": "X", "url": "/x"}]}, headers=api_headers)
    assert org_settings.shared_links() is not None
    r = await client.put(URL, json={"links": []}, headers=api_headers)
    assert r.json() == {"links": []}
    assert org_settings.shared_links() is None
    async with repo._session_factory() as s:
        assert (await s.get(OrgSettingsORM, 1)).shared_links is None


def test_check_link_url_direkt():
    from app.schemas.shared_links import check_link_url

    for ok in ("/", "/rundvisning/", "/a\\b", "https://example.org/x?y=1#z", "HTTP://example.org"):
        assert check_link_url(ok) == ok
    for bad in ("/\\x", "//x", "\\\\x", "/x\ty", "/x\ny"):
        with pytest.raises(ValueError):
            check_link_url(bad)
