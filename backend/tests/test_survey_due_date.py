"""Survey due date ("bäst före") behavior."""
import pytest


@pytest.mark.asyncio
async def test_survey_due_date_lifecycle(client, api_headers):
    resp = await client.post(
        "/api/v1/surveys",
        json={"title": "Bäst före-test", "due_date": "2026-09-30"},
        headers=api_headers,
    )
    assert resp.status_code == 201
    survey = resp.json()
    assert survey["due_date"] == "2026-09-30"
    survey_id = survey["id"]

    # Appears in the list summary
    listed = await client.get("/api/v1/surveys", headers=api_headers)
    row = next(s for s in listed.json() if s["id"] == survey_id)
    assert row["due_date"] == "2026-09-30"

    # Updating another field leaves the date untouched (field omitted)
    patched = await client.patch(
        f"/api/v1/surveys/{survey_id}",
        json={"title": "Bäst före-test 2"},
        headers=api_headers,
    )
    assert patched.json()["due_date"] == "2026-09-30"

    # Changing the date
    patched = await client.patch(
        f"/api/v1/surveys/{survey_id}",
        json={"due_date": "2026-10-15"},
        headers=api_headers,
    )
    assert patched.json()["due_date"] == "2026-10-15"

    # Explicit null clears it
    patched = await client.patch(
        f"/api/v1/surveys/{survey_id}",
        json={"due_date": None},
        headers=api_headers,
    )
    assert patched.json()["due_date"] is None


@pytest.mark.asyncio
async def test_due_date_in_response_summaries(client, api_headers):
    resp = await client.post(
        "/api/v1/surveys",
        json={"title": "Bäst före i svarslistan", "due_date": "2026-08-20"},
        headers=api_headers,
    )
    survey_id = resp.json()["id"]

    resolved = await client.post(
        f"/api/v1/surveys/{survey_id}/resolve-recipients", headers=api_headers
    )
    assert resolved.status_code == 200
    for slot in resolved.json():
        assert slot["survey_due_date"] == "2026-08-20"
