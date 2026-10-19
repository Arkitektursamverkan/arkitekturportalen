"""Renaming a report: the override, restoring the default, and published editions."""
import pytest


@pytest.mark.asyncio
async def test_rename_and_restore_a_builtin_report(client, api_headers):
    resp = await client.put(
        "/api/v1/report-names/portfolio",
        json={"name": "  Systemportfölj  "},
        headers=api_headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"report_key": "portfolio", "name": "Systemportfölj"}

    listing = (await client.get("/api/v1/report-names", headers=api_headers)).json()
    assert {r["report_key"]: r["name"] for r in listing}["portfolio"] == "Systemportfölj"

    # Renaming again replaces the override rather than adding a second row.
    await client.put(
        "/api/v1/report-names/portfolio", json={"name": "Applikationer"}, headers=api_headers
    )
    listing = (await client.get("/api/v1/report-names", headers=api_headers)).json()
    assert [r for r in listing if r["report_key"] == "portfolio"] == [
        {"report_key": "portfolio", "name": "Applikationer"}
    ]

    resp = await client.delete("/api/v1/report-names/portfolio", headers=api_headers)
    assert resp.status_code == 204
    listing = (await client.get("/api/v1/report-names", headers=api_headers)).json()
    assert not any(r["report_key"] == "portfolio" for r in listing)


@pytest.mark.asyncio
async def test_an_empty_name_is_rejected(client, api_headers):
    resp = await client.put(
        "/api/v1/report-names/hosting", json={"name": "   "}, headers=api_headers
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_restoring_a_report_that_was_never_renamed_is_404(client, api_headers):
    resp = await client.delete("/api/v1/report-names/nis2", headers=api_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_renaming_a_published_edition_changes_the_edition(client, api_headers):
    """A published edition owns its name — its exports read it — so the rename
    lands on the row instead of in an override."""
    survey = await client.post(
        "/api/v1/surveys",
        json={
            "title": "Enkät att döpa om",
            "questions": [{"id": "q1", "type": "text", "label": "Fritext", "reports": [1]}],
            "reports": [{"number": 1, "name": "Originalnamn", "conditions": []}],
        },
        headers=api_headers,
    )
    assert survey.status_code == 201, survey.text
    published = await client.post(
        f"/api/v1/surveys/{survey.json()['id']}/reports/1/publish", json={}, headers=api_headers
    )
    assert published.status_code == 201, published.text
    report_id = published.json()["id"]

    resp = await client.put(
        f"/api/v1/report-names/published:{report_id}",
        json={"name": "Omdöpt upplaga"},
        headers=api_headers,
    )
    assert resp.status_code == 200, resp.text

    # The edition itself carries the new name — not a shadow on top of it.
    edition = (await client.get(f"/api/v1/published-reports/{report_id}", headers=api_headers)).json()
    assert edition["name"] == "Omdöpt upplaga"
    listing = (await client.get("/api/v1/report-names", headers=api_headers)).json()
    assert not any(r["report_key"].startswith("published:") for r in listing)

    # There is no translated original to fall back to.
    resp = await client.delete(f"/api/v1/report-names/published:{report_id}", headers=api_headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_a_malformed_published_key_is_a_400(client, api_headers):
    resp = await client.put(
        "/api/v1/report-names/published:inte-en-uuid",
        json={"name": "Namn"},
        headers=api_headers,
    )
    assert resp.status_code == 400
