"""CSV export of survey answers, and the admin-only guard on survey deletion."""
import csv
import io

import pytest

from app.auth import hash_password


async def _login(client, email: str, password: str) -> dict[str, str]:
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['token']}"}


def _parse(body: bytes) -> list[dict[str, str]]:
    text = body.decode("utf-8-sig")
    return list(csv.DictReader(io.StringIO(text), delimiter=";"))


@pytest.mark.asyncio
async def test_export_writes_one_row_per_answered_response(client, api_headers, repo):
    user = await repo.create_local_user(
        name="Export Ekdahl", email="export.ekdahl@example.org", password_hash="x", role="user"
    )

    survey = await client.post(
        "/api/v1/surveys",
        json={
            "title": "Exportenkät 2026",
            "questions": [
                {"id": "q_text", "type": "text", "label": "Beskriv {{system_name}}"},
                {"id": "q_yn", "type": "yes_no", "label": "Är den affärskritisk?"},
                {"id": "q_choice", "type": "multiple_choice", "label": "Driftform",
                 "options": ["Moln", "On-prem"], "allow_multiple": True},
                {"id": "q_matrix", "type": "rating_matrix", "label": "Gradera {{system_name}}",
                 "rows": ["Användarvänlighet", "Funktionalitet"], "scale_min": 1, "scale_max": 10},
            ],
        },
        headers=api_headers,
    )
    assert survey.status_code == 201
    survey_id = survey.json()["id"]

    manual = await client.post(
        f"/api/v1/surveys/{survey_id}/responses/manual",
        json={"user_id": str(user.id)},
        headers=api_headers,
    )
    response_id = manual.json()["id"]
    await client.post(f"/api/v1/surveys/{survey_id}/launch", headers=api_headers)

    submitted = await client.post(
        f"/api/v1/my-surveys/{response_id}/answers",
        json={"answers": {
            "q_text": "Ett system för fakturor",
            "q_yn": True,
            "q_choice": ["Moln", "On-prem"],
            "q_matrix": {"Användarvänlighet": 7, "Funktionalitet": 4},
        }},
        headers=api_headers,
    )
    assert submitted.status_code == 200

    export = await client.get(f"/api/v1/surveys/{survey_id}/responses/export", headers=api_headers)
    assert export.status_code == 200
    assert export.headers["content-type"].startswith("text/csv")
    assert "enkatsvar_exportenkat_2026_" in export.headers["content-disposition"]
    # The BOM is what makes Excel read åäö correctly.
    assert export.content.startswith(b"\xef\xbb\xbf")

    rows = _parse(export.content)
    assert len(rows) == 1
    row = rows[0]
    assert row["Status"] == "Inskickad"
    # {{system_name}} varies per row, so a header resolves it to the survey's
    # target type — "applikationen" for an Application survey.
    assert row["Beskriv applikationen"] == "Ett system för fakturor"
    assert row["Är den affärskritisk?"] == "Ja"
    assert row["Driftform"] == "Moln, On-prem"
    # A matrix becomes one numeric column per parameter.
    assert row["Gradera applikationen — Användarvänlighet"] == "7"
    assert row["Gradera applikationen — Funktionalitet"] == "4"


@pytest.mark.asyncio
async def test_export_skips_unanswered_slots(client, api_headers, repo):
    user = await repo.create_local_user(
        name="Tyst Tegnér", email="tyst.tegner@example.org", password_hash="x", role="user"
    )
    survey = await client.post(
        "/api/v1/surveys",
        json={"title": "Obesvarad", "questions": [{"id": "q1", "type": "text", "label": "Fritext"}]},
        headers=api_headers,
    )
    survey_id = survey.json()["id"]
    await client.post(
        f"/api/v1/surveys/{survey_id}/responses/manual",
        json={"user_id": str(user.id)},
        headers=api_headers,
    )
    await client.post(f"/api/v1/surveys/{survey_id}/launch", headers=api_headers)

    export = await client.get(f"/api/v1/surveys/{survey_id}/responses/export", headers=api_headers)
    assert export.status_code == 200
    assert _parse(export.content) == []


@pytest.mark.asyncio
async def test_deleting_a_survey_requires_admin(client, api_headers, repo):
    """Deletion cascades to every answer — editors must not be able to trigger it."""
    await repo.create_local_user(
        name="Redaktör Ruth", email="redaktor.ruth@example.org",
        password_hash=hash_password("hemligt123"), role="superuser",
    )
    await repo.create_local_user(
        name="Admin Adde", email="admin.adde@example.org",
        password_hash=hash_password("hemligt123"), role="admin",
    )

    survey = await client.post(
        "/api/v1/surveys", json={"title": "Skyddad enkät"}, headers=api_headers
    )
    survey_id = survey.json()["id"]

    editor = await _login(client, "redaktor.ruth@example.org", "hemligt123")
    forbidden = await client.delete(f"/api/v1/surveys/{survey_id}", headers=editor)
    assert forbidden.status_code == 403

    # The editor keeps every non-destructive capability, including the export.
    assert (await client.get(f"/api/v1/surveys/{survey_id}", headers=editor)).status_code == 200
    assert (
        await client.get(f"/api/v1/surveys/{survey_id}/responses/export", headers=editor)
    ).status_code == 200

    admin = await _login(client, "admin.adde@example.org", "hemligt123")
    assert (await client.delete(f"/api/v1/surveys/{survey_id}", headers=admin)).status_code == 204
