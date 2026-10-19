"""Rating-matrix questions: several parameters rated on a shared scale."""
import pytest


@pytest.mark.asyncio
async def test_required_matrix_needs_every_parameter_rated(client, api_headers, repo):
    user = await repo.create_local_user(
        name="Matris Marklund", email="matris.marklund@example.org", password_hash="x", role="user"
    )

    survey = await client.post(
        "/api/v1/surveys",
        json={
            "title": "Matristest",
            "questions": [
                {
                    "id": "q_grading",
                    "type": "rating_matrix",
                    "label": "Så här graderar jag {system_name} avseende...",
                    "required": True,
                    "rows": ["Användarvänlighet", "Funktionalitet"],
                    "scale_min": 1,
                    "scale_max": 10,
                }
            ],
        },
        headers=api_headers,
    )
    assert survey.status_code == 201
    assert survey.json()["questions"][0]["rows"] == ["Användarvänlighet", "Funktionalitet"]
    survey_id = survey.json()["id"]

    manual = await client.post(
        f"/api/v1/surveys/{survey_id}/responses/manual",
        json={"user_id": str(user.id)},
        headers=api_headers,
    )
    assert manual.status_code == 201
    response_id = manual.json()["id"]
    launched = await client.post(f"/api/v1/surveys/{survey_id}/launch", headers=api_headers)
    assert launched.json()["launched"] == 1

    # Rating only one of two parameters is not enough for a required matrix.
    partial = await client.post(
        f"/api/v1/my-surveys/{response_id}/answers",
        json={"answers": {"q_grading": {"Användarvänlighet": 7}}},
        headers=api_headers,
    )
    assert partial.status_code == 400
    assert "gradera alla parametrar" in partial.json()["detail"]

    complete = await client.post(
        f"/api/v1/my-surveys/{response_id}/answers",
        json={"answers": {"q_grading": {"Användarvänlighet": 7, "Funktionalitet": 4}}},
        headers=api_headers,
    )
    assert complete.status_code == 200
    assert complete.json()["answers"]["q_grading"] == {"Användarvänlighet": 7, "Funktionalitet": 4}
