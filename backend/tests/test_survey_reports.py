"""Numbered reports: question tagging, conditions, and CSV/PDF output."""
import csv
import io

import pytest

from app.auth import issue_local_token


def _parse(body: bytes) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(body.decode("utf-8-sig")), delimiter=";"))


def _as(user) -> dict[str, str]:
    """Respondents submit their own answers, so submitted_by is their e-mail."""
    return {"Authorization": f"Bearer {issue_local_token(user)}"}


async def _survey_with_two_answers(client, api_headers, repo, suffix: str):
    """A survey where one respondent reports a need and one does not."""
    users = []
    for i, name in enumerate(("Behov Berg", "Nöjd Nyström")):
        users.append(await repo.create_local_user(
            name=name, email=f"r{i}.{suffix}@example.org", password_hash="x", role="user"
        ))

    survey = await client.post(
        "/api/v1/surveys",
        json={
            "title": f"Integrationer {suffix}",
            "questions": [
                {"id": "q_behov", "type": "yes_no", "label": "Ser du behov av integrationer?",
                 "reports": [1]},
                {"id": "q_beskriv", "type": "text", "label": "Beskriv behovet", "reports": [1]},
                {"id": "q_ovrigt", "type": "text", "label": "Övrig kommentar"},
            ],
            "reports": [
                {"number": 1, "name": "Integrationsbehov",
                 "conditions": [{"question_id": "q_behov", "op": "eq", "value": True}]},
            ],
        },
        headers=api_headers,
    )
    assert survey.status_code == 201, survey.text
    survey_id = survey.json()["id"]

    response_ids = []
    for user in users:
        manual = await client.post(
            f"/api/v1/surveys/{survey_id}/responses/manual",
            json={"user_id": str(user.id)},
            headers=api_headers,
        )
        response_ids.append(manual.json()["id"])
    await client.post(f"/api/v1/surveys/{survey_id}/launch", headers=api_headers)

    await client.post(
        f"/api/v1/my-surveys/{response_ids[0]}/answers",
        json={"answers": {"q_behov": True, "q_beskriv": "Koppling till Agda saknas",
                          "q_ovrigt": "Ingen kommentar"}},
        headers=_as(users[0]),
    )
    await client.post(
        f"/api/v1/my-surveys/{response_ids[1]}/answers",
        json={"answers": {"q_behov": False, "q_beskriv": "", "q_ovrigt": "Allt fungerar"}},
        headers=_as(users[1]),
    )
    return survey_id


@pytest.mark.asyncio
async def test_report_includes_only_responses_matching_the_condition(client, api_headers, repo):
    survey_id = await _survey_with_two_answers(client, api_headers, repo, "a")

    report = await client.get(f"/api/v1/surveys/{survey_id}/reports/1", headers=api_headers)
    assert report.status_code == 200
    data = report.json()

    assert data["name"] == "Integrationsbehov"
    assert data["answered_count"] == 2
    assert data["matching_count"] == 1
    assert data["conditions"] == ["Ser du behov av integrationer? är Ja"]
    # Only tagged questions are part of the report.
    assert [q["id"] for q in data["questions"]] == ["q_behov", "q_beskriv"]

    assert len(data["rows"]) == 1
    row = data["rows"][0]
    assert row["answers"]["q_behov"] == "Ja"
    assert row["answers"]["q_beskriv"] == "Koppling till Agda saknas"
    # The untagged question is left out even though it was answered.
    assert "q_ovrigt" not in row["answers"]


@pytest.mark.asyncio
async def test_report_listing_counts_matches_per_slot(client, api_headers, repo):
    survey_id = await _survey_with_two_answers(client, api_headers, repo, "b")

    listing = await client.get(f"/api/v1/surveys/{survey_id}/reports", headers=api_headers)
    assert listing.status_code == 200
    assert listing.json() == [
        {"number": 1, "name": "Integrationsbehov", "question_count": 2, "matching_count": 1}
    ]


@pytest.mark.asyncio
async def test_report_exports_as_csv_and_pdf(client, api_headers, repo):
    survey_id = await _survey_with_two_answers(client, api_headers, repo, "c")

    as_csv = await client.get(
        f"/api/v1/surveys/{survey_id}/reports/1/export", headers=api_headers
    )
    assert as_csv.status_code == 200
    assert "rapport_integrationer_c_integrationsbehov_" in as_csv.headers["content-disposition"]
    rows = _parse(as_csv.content)
    assert len(rows) == 1
    assert rows[0]["Beskriv behovet"] == "Koppling till Agda saknas"
    # Untagged questions must not leak into a report export.
    assert "Övrig kommentar" not in rows[0]

    as_pdf = await client.get(
        f"/api/v1/surveys/{survey_id}/reports/1/export?format=pdf", headers=api_headers
    )
    assert as_pdf.status_code == 200
    assert as_pdf.headers["content-type"] == "application/pdf"
    assert as_pdf.content.startswith(b"%PDF")
    assert as_pdf.headers["content-disposition"].endswith('.pdf"')


@pytest.mark.asyncio
async def test_report_tags_stay_editable_after_answers_arrive(client, api_headers, repo):
    """The wording respondents saw stays frozen; how it is reported does not."""
    survey_id = await _survey_with_two_answers(client, api_headers, repo, "d")
    survey = (await client.get(f"/api/v1/surveys/{survey_id}", headers=api_headers)).json()

    retagged = [dict(q) for q in survey["questions"]]
    retagged[2]["reports"] = [1, 2]  # "Övrig kommentar" joins reports 1 and 2
    ok = await client.patch(
        f"/api/v1/surveys/{survey_id}",
        json={"questions": retagged,
              "reports": [*survey["reports"], {"number": 2, "name": "Kommentarer", "conditions": []}]},
        headers=api_headers,
    )
    assert ok.status_code == 200
    assert ok.json()["questions"][2]["reports"] == [1, 2]

    report_2 = (await client.get(f"/api/v1/surveys/{survey_id}/reports/2", headers=api_headers)).json()
    # No conditions on report 2 — every answered response is included.
    assert report_2["matching_count"] == 2

    # Changing the question itself is still refused.
    reworded = [dict(q) for q in survey["questions"]]
    reworded[0]["label"] = "Helt annan fråga"
    blocked = await client.patch(
        f"/api/v1/surveys/{survey_id}", json={"questions": reworded}, headers=api_headers
    )
    assert blocked.status_code == 400
    assert "kan inte längre ändras" in blocked.json()["detail"]


@pytest.mark.asyncio
async def test_report_rejects_unknown_slot_and_dangling_condition(client, api_headers, repo):
    survey = await client.post(
        "/api/v1/surveys",
        json={"title": "Villkorstest", "questions": [{"id": "q1", "type": "text", "label": "Fritext"}]},
        headers=api_headers,
    )
    survey_id = survey.json()["id"]

    missing = await client.get(f"/api/v1/surveys/{survey_id}/reports/9", headers=api_headers)
    assert missing.status_code == 404

    dangling = await client.patch(
        f"/api/v1/surveys/{survey_id}",
        json={"reports": [{"number": 1, "name": "Trasig",
                           "conditions": [{"question_id": "finns_inte", "op": "eq", "value": True}]}]},
        headers=api_headers,
    )
    assert dangling.status_code == 400
    assert "villkor" in dangling.json()["detail"]


@pytest.mark.asyncio
async def test_report_shows_the_question_its_condition_selects_on(client, api_headers, repo):
    """A condition question is part of the report even when nobody tagged it."""
    survey_id = await _survey_with_two_answers(client, api_headers, repo, "f")
    survey = (await client.get(f"/api/v1/surveys/{survey_id}", headers=api_headers)).json()

    untagged = [dict(q) for q in survey["questions"]]
    untagged[0]["reports"] = []  # "Ser du behov av integrationer?" is only the condition now
    ok = await client.patch(
        f"/api/v1/surveys/{survey_id}", json={"questions": untagged}, headers=api_headers
    )
    assert ok.status_code == 200

    data = (await client.get(f"/api/v1/surveys/{survey_id}/reports/1", headers=api_headers)).json()
    assert [q["id"] for q in data["questions"]] == ["q_behov", "q_beskriv"]
    assert data["rows"][0]["answers"]["q_behov"] == "Ja"

    listed = (await client.get(f"/api/v1/surveys/{survey_id}/reports", headers=api_headers)).json()
    assert listed[0]["question_count"] == 2

    rows = _parse(
        (await client.get(
            f"/api/v1/surveys/{survey_id}/reports/1/export", headers=api_headers
        )).content
    )
    assert rows[0]["Ser du behov av integrationer?"] == "Ja"


@pytest.mark.asyncio
async def test_report_conditions_can_be_joined_with_or(client, api_headers, repo):
    """Two conditions that no single respondent can both meet still select rows."""
    survey_id = await _survey_with_two_answers(client, api_headers, repo, "g")

    async def set_join(join: str) -> dict:
        ok = await client.patch(
            f"/api/v1/surveys/{survey_id}",
            json={"reports": [{
                "number": 1, "name": "Integrationsbehov",
                "conditions": [
                    {"question_id": "q_behov", "op": "eq", "value": True},
                    {"question_id": "q_ovrigt", "op": "answered", "join": join},
                ],
            }]},
            headers=api_headers,
        )
        assert ok.status_code == 200, ok.text
        report = await client.get(f"/api/v1/surveys/{survey_id}/reports/1", headers=api_headers)
        return report.json()

    both = await set_join("or")
    assert both["conditions"] == [
        "Ser du behov av integrationer? är Ja",
        "eller Övrig kommentar är besvarad",
    ]
    # Only one respondent reports a need, but both wrote a comment.
    assert both["matching_count"] == 2

    narrowed = await set_join("and")
    assert narrowed["conditions"][1].startswith("och ")
    assert narrowed["matching_count"] == 1


def test_report_and_binds_tighter_than_or():
    """A and B or C is read as (A and B) or C, not A and (B or C)."""
    from app.services.survey_report import response_matches_report

    report = {
        "number": 1,
        "conditions": [
            {"question_id": "a", "op": "eq", "value": True},
            {"question_id": "b", "op": "eq", "value": True, "join": "and"},
            {"question_id": "c", "op": "eq", "value": True, "join": "or"},
        ],
    }
    assert response_matches_report(report, {"answers": {"a": True, "b": True, "c": False}})
    assert response_matches_report(report, {"answers": {"a": False, "b": False, "c": True}})
    assert not response_matches_report(report, {"answers": {"a": True, "b": False, "c": False}})


@pytest.mark.asyncio
async def test_publishing_freezes_the_report(client, api_headers, repo):
    """A published edition keeps its numbers when the live report moves on."""
    survey_id = await _survey_with_two_answers(client, api_headers, repo, "h")

    published = await client.post(
        f"/api/v1/surveys/{survey_id}/reports/1/publish",
        json={"name": "Integrationsbehov augusti"},
        headers=api_headers,
    )
    assert published.status_code == 201, published.text
    edition = published.json()
    assert edition["name"] == "Integrationsbehov augusti"
    assert edition["survey_title"] == "Integrationer h"
    assert edition["matching_count"] == 1
    assert edition["published_at"]

    # Widen the live report: no conditions at all, so both answers now count.
    widened = await client.patch(
        f"/api/v1/surveys/{survey_id}",
        json={"reports": [{"number": 1, "name": "Allt", "conditions": []}]},
        headers=api_headers,
    )
    assert widened.status_code == 200
    live = (await client.get(f"/api/v1/surveys/{survey_id}/reports/1", headers=api_headers)).json()
    assert live["matching_count"] == 2

    frozen = (await client.get(
        f"/api/v1/published-reports/{edition['id']}", headers=api_headers
    )).json()
    assert frozen["name"] == "Integrationsbehov augusti"
    assert frozen["payload"]["matching_count"] == 1
    assert frozen["payload"]["conditions"] == ["Ser du behov av integrationer? är Ja"]

    listing = (await client.get("/api/v1/published-reports", headers=api_headers)).json()
    assert edition["id"] in [r["id"] for r in listing]

    csv_rows = _parse((await client.get(
        f"/api/v1/published-reports/{edition['id']}/export", headers=api_headers
    )).content)
    assert len(csv_rows) == 1
    assert csv_rows[0]["Beskriv behovet"] == "Koppling till Agda saknas"

    as_pdf = await client.get(
        f"/api/v1/published-reports/{edition['id']}/export?format=pdf", headers=api_headers
    )
    assert as_pdf.status_code == 200
    assert as_pdf.content.startswith(b"%PDF")


@pytest.mark.asyncio
async def test_publishing_twice_keeps_both_editions(client, api_headers, repo):
    survey_id = await _survey_with_two_answers(client, api_headers, repo, "i")

    first = await client.post(
        f"/api/v1/surveys/{survey_id}/reports/1/publish", json={}, headers=api_headers
    )
    second = await client.post(
        f"/api/v1/surveys/{survey_id}/reports/1/publish", json={}, headers=api_headers
    )
    assert first.status_code == second.status_code == 201
    assert first.json()["id"] != second.json()["id"]
    # Falls back to the report's own name when none is given.
    assert second.json()["name"] == "Integrationsbehov"

    gone = await client.delete(
        f"/api/v1/published-reports/{first.json()['id']}", headers=api_headers
    )
    assert gone.status_code == 204
    missing = await client.get(
        f"/api/v1/published-reports/{first.json()['id']}", headers=api_headers
    )
    assert missing.status_code == 404
    # Deleting one edition leaves the other alone.
    still = await client.get(
        f"/api/v1/published-reports/{second.json()['id']}", headers=api_headers
    )
    assert still.status_code == 200


@pytest.mark.asyncio
async def test_reports_are_anonymous_unless_turned_off(client, api_headers, repo):
    """The respondent's name is stripped in the report, its CSV and its editions."""
    survey_id = await _survey_with_two_answers(client, api_headers, repo, "j")

    # Nothing said about anonymity: the default applies.
    data = (await client.get(f"/api/v1/surveys/{survey_id}/reports/1", headers=api_headers)).json()
    assert data["anonymous"] is True
    assert data["rows"][0]["submitted_by"] == ""
    assert data["rows"][0]["recipient"] == ""
    # The object and the answers are untouched.
    assert data["rows"][0]["answers"]["q_beskriv"] == "Koppling till Agda saknas"
    assert data["rows"][0]["submitted_at"]

    rows = _parse((await client.get(
        f"/api/v1/surveys/{survey_id}/reports/1/export", headers=api_headers
    )).content)
    assert "Mottagare" not in rows[0]
    assert "E-post" not in rows[0]
    assert "Inskickad av" not in rows[0]

    # A published edition freezes the anonymised copy.
    published = await client.post(
        f"/api/v1/surveys/{survey_id}/reports/1/publish", json={}, headers=api_headers
    )
    frozen = (await client.get(
        f"/api/v1/published-reports/{published.json()['id']}", headers=api_headers
    )).json()
    assert frozen["payload"]["rows"][0]["submitted_by"] == ""

    # Turned off, the names come back.
    named = await client.patch(
        f"/api/v1/surveys/{survey_id}",
        json={"reports": [{
            "number": 1, "name": "Integrationsbehov", "anonymous": False,
            "conditions": [{"question_id": "q_behov", "op": "eq", "value": True}],
        }]},
        headers=api_headers,
    )
    assert named.status_code == 200
    data = (await client.get(f"/api/v1/surveys/{survey_id}/reports/1", headers=api_headers)).json()
    assert data["anonymous"] is False
    assert data["rows"][0]["submitted_by"] == "r0.j@example.org"
    rows = _parse((await client.get(
        f"/api/v1/surveys/{survey_id}/reports/1/export", headers=api_headers
    )).content)
    assert rows[0]["Inskickad av"] == "r0.j@example.org"
