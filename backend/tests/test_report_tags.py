"""Report tags: creating them, tagging reports, and what deletion takes with it.

The test database is built with create_all, not with the migrations, so the
tags the 0051 migration seeds are not here — every test makes its own.
"""
import pytest


async def _tag(client, api_headers, name: str, **kwargs) -> dict:
    body = {"name": name, "color": "#2196F3", "sort_order": 10, **kwargs}
    resp = await client.post("/api/v1/report-tags", json=body, headers=api_headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_slug_is_derived_from_a_swedish_name(client, api_headers):
    tag = await _tag(client, api_headers, "Säkerhet & kontinuitet")
    assert tag["slug"] == "sakerhet-kontinuitet"
    assert tag["color"] == "#2196F3"


@pytest.mark.asyncio
async def test_duplicate_slug_is_rejected(client, api_headers):
    await _tag(client, api_headers, "Ekonomi dubblett")
    resp = await client.post(
        "/api/v1/report-tags",
        json={"name": "Ekonomi dubblett", "color": "#00897B", "sort_order": 20},
        headers=api_headers,
    )
    assert resp.status_code == 400
    assert "finns redan" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_colour_must_be_hex(client, api_headers):
    resp = await client.post(
        "/api/v1/report-tags",
        json={"name": "Trasig färg", "color": "blå", "sort_order": 10},
        headers=api_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_assignment_replaces_the_whole_tag_set(client, api_headers):
    first = await _tag(client, api_headers, "Teknik assign", sort_order=40)
    second = await _tag(client, api_headers, "Applikation assign", sort_order=20)

    async def tags_for(report_key: str) -> set[str]:
        listing = (await client.get("/api/v1/report-tags", headers=api_headers)).json()
        return {t["id"] for t in listing if report_key in t["report_keys"]}

    await client.put(
        "/api/v1/report-tags/assignments/hosting",
        json={"tag_ids": [first["id"], second["id"]]},
        headers=api_headers,
    )
    assert await tags_for("hosting") == {first["id"], second["id"]}

    # A second save is a replace, not a merge.
    resp = await client.put(
        "/api/v1/report-tags/assignments/hosting",
        json={"tag_ids": [second["id"]]},
        headers=api_headers,
    )
    assert resp.status_code == 200
    # The response is the regrouped listing, so the UI needs no refetch.
    assert {t["id"] for t in resp.json() if "hosting" in t["report_keys"]} == {second["id"]}
    assert await tags_for("hosting") == {second["id"]}


@pytest.mark.asyncio
async def test_unknown_tag_ids_are_dropped_not_rejected(client, api_headers):
    """A tag deleted in another tab must not wedge someone else's save."""
    import uuid

    keep = await _tag(client, api_headers, "Kvarvarande tagg", sort_order=60)
    resp = await client.put(
        "/api/v1/report-tags/assignments/costs",
        json={"tag_ids": [keep["id"], str(uuid.uuid4())]},
        headers=api_headers,
    )
    assert resp.status_code == 200
    assert {t["id"] for t in resp.json() if "costs" in t["report_keys"]} == {keep["id"]}


@pytest.mark.asyncio
async def test_listing_is_in_menu_order(client, api_headers):
    late = await _tag(client, api_headers, "Sist i menyn", sort_order=900)
    early = await _tag(client, api_headers, "Först i menyn", sort_order=1)
    listing = (await client.get("/api/v1/report-tags", headers=api_headers)).json()
    ids = [t["id"] for t in listing]
    assert ids.index(early["id"]) < ids.index(late["id"])


@pytest.mark.asyncio
async def test_deleting_a_tag_only_untags_its_reports(client, api_headers):
    doomed = await _tag(client, api_headers, "Tagg som tas bort", sort_order=70)
    kept = await _tag(client, api_headers, "Tagg som blir kvar", sort_order=71)
    await client.put(
        "/api/v1/report-tags/assignments/lifecycle",
        json={"tag_ids": [doomed["id"], kept["id"]]},
        headers=api_headers,
    )

    resp = await client.delete(f"/api/v1/report-tags/{doomed['id']}", headers=api_headers)
    assert resp.status_code == 204

    listing = (await client.get("/api/v1/report-tags", headers=api_headers)).json()
    assert doomed["id"] not in {t["id"] for t in listing}
    # The other tag — and the report under it — is untouched.
    assert {t["id"] for t in listing if "lifecycle" in t["report_keys"]} == {kept["id"]}


@pytest.mark.asyncio
async def test_update_changes_name_colour_and_order(client, api_headers):
    tag = await _tag(client, api_headers, "Innan ändring", sort_order=30)
    resp = await client.patch(
        f"/api/v1/report-tags/{tag['id']}",
        json={"name": "Efter ändring", "color": "#00897b", "sort_order": 5},
        headers=api_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["name"] == "Efter ändring"
    assert body["color"] == "#00897B"  # normalised to upper case
    assert body["sort_order"] == 5
    # The slug is the stable handle — renaming must not move it.
    assert body["slug"] == tag["slug"]


@pytest.mark.asyncio
async def test_a_one_character_name_is_a_valid_tag(client, api_headers):
    """"A" slugifies to "a" — short, but a perfectly good id."""
    tag = await _tag(client, api_headers, "A")
    assert tag["slug"] == "a"


@pytest.mark.asyncio
async def test_a_long_name_does_not_slugify_to_a_trailing_hyphen(client, api_headers):
    """The 50-character cut must not land on a separator and leave "…-"."""
    # 49 letters, a space, then more: the raw slug's 50th character is the
    # hyphen the space became, so a naive truncation would end on it.
    name = "a" * 49 + " bcd"
    tag = await _tag(client, api_headers, name)
    assert len(tag["slug"]) <= 50
    assert not tag["slug"].endswith("-")


@pytest.mark.asyncio
async def test_an_over_long_report_key_is_a_400_not_a_500(client, api_headers):
    resp = await client.post(
        "/api/v1/report-tags",
        json={
            "name": "För lång nyckel",
            "color": "#607D8B",
            "sort_order": 10,
            "report_keys": ["x" * 200],
        },
        headers=api_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_a_published_edition_is_filed_under_enkater(client, api_headers, repo):
    """Publishing tags the edition, so it never shows up under "Övrigt"."""
    enkater = await _tag(client, api_headers, "Enkäter", slug="enkater", sort_order=90)

    survey = await client.post(
        "/api/v1/surveys",
        json={
            "title": "Taggad enkät",
            "questions": [{"id": "q1", "type": "text", "label": "Fritext", "reports": [1]}],
            "reports": [{"number": 1, "name": "Enkätrapport", "conditions": []}],
        },
        headers=api_headers,
    )
    assert survey.status_code == 201, survey.text
    survey_id = survey.json()["id"]

    published = await client.post(
        f"/api/v1/surveys/{survey_id}/reports/1/publish", json={}, headers=api_headers
    )
    assert published.status_code == 201, published.text
    key = f"published:{published.json()['id']}"

    listing = (await client.get("/api/v1/report-tags", headers=api_headers)).json()
    assert {t["id"] for t in listing if key in t["report_keys"]} == {enkater["id"]}

    # Unpublishing takes the link with it — the key would otherwise linger.
    await client.delete(f"/api/v1/published-reports/{published.json()['id']}", headers=api_headers)
    listing = (await client.get("/api/v1/report-tags", headers=api_headers)).json()
    assert not any(key in t["report_keys"] for t in listing)
