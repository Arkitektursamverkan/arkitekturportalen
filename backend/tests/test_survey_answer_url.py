"""Enkät som besvaras i en annan app.

Kontraktet som låses här:
- Utan adress besvaras enkäten i portalens formulär, som förut.
- Adressen följer med till mottagaren (Mina enkäter och svarssidan), så att
  webben kan öppna appen i stället för formuläret.
- Samma adresser som för snabblänkarna: http(s) eller en sida på samma server.
- Ändras som bäst före-datumet: null eller tom text tar bort adressen, ett
  utelämnat fält lämnar den orörd.
- Svar via API:t fungerar som vanligt.
"""
import pytest

from app.auth import issue_local_token

FRAGA = [{"id": "q_text", "type": "text", "label": "Något att säga?"}]


async def _skapa(client, api_headers, **extra) -> dict:
    r = await client.post("/api/v1/surveys", json={"title": "Annan app", "questions": FRAGA, **extra}, headers=api_headers)
    assert r.status_code == 201, r.text
    return r.json()


@pytest.mark.asyncio
async def test_utan_adress_som_forut(client, api_headers):
    assert (await _skapa(client, api_headers))["answer_url"] is None


@pytest.mark.asyncio
async def test_adressen_nar_mottagaren_och_svar_fungerar(client, api_headers, repo):
    user = await repo.create_local_user(name="App Appelqvist", email="app.appelqvist@example.org", password_hash="x", role="user")
    vem = {"Authorization": f"Bearer {issue_local_token(user)}"}
    survey = await _skapa(client, api_headers, answer_url="  /rundvisning/  ")
    assert survey["answer_url"] == "/rundvisning/"

    slot = (await client.post(f"/api/v1/surveys/{survey['id']}/responses/manual",
                              json={"user_id": str(user.id)}, headers=api_headers)).json()
    await client.post(f"/api/v1/surveys/{survey['id']}/launch", headers=api_headers)

    mina = (await client.get("/api/v1/my-surveys", headers=vem)).json()
    assert [m["survey_answer_url"] for m in mina if m["id"] == slot["id"]] == ["/rundvisning/"]
    detalj = (await client.get(f"/api/v1/my-surveys/{slot['id']}", headers=vem)).json()
    assert detalj["survey_answer_url"] == "/rundvisning/"

    svar = await client.post(f"/api/v1/my-surveys/{slot['id']}/answers", json={"answers": {"q_text": "Hej"}}, headers=vem)
    assert svar.status_code == 200, svar.text


@pytest.mark.asyncio
@pytest.mark.parametrize("url", ["javascript:alert(1)", "//evil.example.org/", "intra.example.org", "data:text/html,x"])
async def test_ogiltig_adress(client, api_headers, url):
    r = await client.post("/api/v1/surveys", json={"title": "X", "questions": FRAGA, "answer_url": url}, headers=api_headers)
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_andra_ta_bort_och_lamna(client, api_headers):
    sid = (await _skapa(client, api_headers))["id"]
    url = f"/api/v1/surveys/{sid}"
    assert (await client.patch(url, json={"answer_url": "https://app.example.org/svar"}, headers=api_headers)).json()["answer_url"] == "https://app.example.org/svar"
    # Utelämnat fält: adressen ligger kvar.
    assert (await client.patch(url, json={"title": "Nytt namn"}, headers=api_headers)).json()["answer_url"] == "https://app.example.org/svar"
    # Tom text tar bort, liksom null.
    assert (await client.patch(url, json={"answer_url": ""}, headers=api_headers)).json()["answer_url"] is None
    await client.patch(url, json={"answer_url": "/x"}, headers=api_headers)
    assert (await client.patch(url, json={"answer_url": None}, headers=api_headers)).json()["answer_url"] is None
    assert (await client.patch(url, json={"answer_url": "javascript:x"}, headers=api_headers)).status_code == 422
