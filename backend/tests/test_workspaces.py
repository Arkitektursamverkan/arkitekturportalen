"""IT-arkitekturuppdrag: membership decides access, not the global role."""
import uuid

import pytest


async def _local_user(client, api_headers, name: str, role: str = "user") -> dict:
    """Create a local account and return {id, headers} for it."""
    email = f"{uuid.uuid4().hex[:8]}@example.org"
    resp = await client.post(
        "/api/v1/users",
        json={"name": name, "email": email, "password": "prov-losen-123", "role": role},
        headers=api_headers,
    )
    assert resp.status_code == 201, resp.text
    user_id = resp.json()["id"]

    login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "prov-losen-123"}
    )
    assert login.status_code == 200, login.text
    return {
        "id": user_id,
        "email": email,
        "headers": {"Authorization": f"Bearer {login.json()['token']}"},
    }


async def _workspace(client, owner, **overrides) -> dict:
    payload = {"name": "Inventering av IT-landskapet", "description": "Provuppdrag"}
    payload.update(overrides)
    resp = await client.post("/api/v1/workspaces", json=payload, headers=owner["headers"])
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_creator_becomes_owner_and_members_are_added(client, api_headers):
    owner = await _local_user(client, api_headers, "Ägare Provsson", role="superuser")
    member = await _local_user(client, api_headers, "Medlem Provlund")

    ws = await _workspace(client, owner, member_ids=[member["id"]])
    assert ws["my_role"] == "owner"
    assert ws["is_member"] is True
    roles = {m["email"]: m["role"] for m in ws["members"]}
    assert roles == {owner["email"]: "owner", member["email"]: "member"}


@pytest.mark.asyncio
async def test_private_workspace_is_invisible_to_non_members(client, api_headers):
    owner = await _local_user(client, api_headers, "Ägare Enskild", role="superuser")
    outsider = await _local_user(client, api_headers, "Utomstående Provsson")

    ws = await _workspace(client, owner, name="Hemligt uppdrag")

    listed = await client.get("/api/v1/workspaces", headers=outsider["headers"])
    assert listed.status_code == 200
    assert ws["id"] not in [w["id"] for w in listed.json()]

    # 404, not 403 — a private uppdrag doesn't reveal that it exists
    direct = await client.get(f"/api/v1/workspaces/{ws['id']}", headers=outsider["headers"])
    assert direct.status_code == 404


@pytest.mark.asyncio
async def test_internal_workspace_is_readable_but_not_writable(client, api_headers):
    owner = await _local_user(client, api_headers, "Ägare Öppen", role="superuser")
    outsider = await _local_user(client, api_headers, "Läsare Provsson")

    ws = await _workspace(client, owner, name="Öppet uppdrag", visibility="internal")

    read = await client.get(f"/api/v1/workspaces/{ws['id']}", headers=outsider["headers"])
    assert read.status_code == 200
    assert read.json()["my_role"] == "reader"
    assert read.json()["is_member"] is False

    denied = await client.post(
        f"/api/v1/workspaces/{ws['id']}/posts",
        json={"body": "Får jag skriva?"},
        headers=outsider["headers"],
    )
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_ordinary_user_cannot_create_a_workspace(client, api_headers):
    plain = await _local_user(client, api_headers, "Vanlig Provsson")
    resp = await client.post(
        "/api/v1/workspaces", json={"name": "Egen yta"}, headers=plain["headers"]
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_member_writes_content_but_only_owner_manages_members(client, api_headers):
    owner = await _local_user(client, api_headers, "Ägare Uppdrag", role="superuser")
    member = await _local_user(client, api_headers, "Medlem Uppdrag")
    ws = await _workspace(client, owner, member_ids=[member["id"]])

    page = await client.post(
        f"/api/v1/workspaces/{ws['id']}/pages",
        json={"title": "Instruktion", "body": "# Så inventerar vi"},
        headers=member["headers"],
    )
    assert page.status_code == 201

    task = await client.post(
        f"/api/v1/workspaces/{ws['id']}/tasks",
        json={"title": "Inventera ekonomisystem", "assignee_user_id": member["id"]},
        headers=member["headers"],
    )
    assert task.status_code == 201
    assert task.json()["assignee_name"] == "Medlem Uppdrag"
    assert task.json()["status"] == "todo"

    denied = await client.post(
        f"/api/v1/workspaces/{ws['id']}/members",
        json={"user_id": owner["id"], "role": "reader"},
        headers=member["headers"],
    )
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_last_owner_cannot_be_demoted_or_removed(client, api_headers):
    owner = await _local_user(client, api_headers, "Ensam Ägare", role="superuser")
    ws = await _workspace(client, owner)

    demote = await client.patch(
        f"/api/v1/workspaces/{ws['id']}/members/{owner['id']}",
        json={"role": "member"},
        headers=owner["headers"],
    )
    assert demote.status_code == 400

    remove = await client.delete(
        f"/api/v1/workspaces/{ws['id']}/members/{owner['id']}", headers=owner["headers"]
    )
    assert remove.status_code == 400


@pytest.mark.asyncio
async def test_archived_workspace_is_read_only(client, api_headers):
    owner = await _local_user(client, api_headers, "Ägare Arkiv", role="superuser")
    ws = await _workspace(client, owner)

    archived = await client.patch(
        f"/api/v1/workspaces/{ws['id']}", json={"status": "archived"}, headers=owner["headers"]
    )
    assert archived.status_code == 200
    assert archived.json()["status"] == "archived"

    blocked = await client.post(
        f"/api/v1/workspaces/{ws['id']}/posts",
        json={"body": "Efterlämnat inlägg"},
        headers=owner["headers"],
    )
    assert blocked.status_code == 403

    # The owner can still reopen it
    reopened = await client.patch(
        f"/api/v1/workspaces/{ws['id']}", json={"status": "active"}, headers=owner["headers"]
    )
    assert reopened.json()["status"] == "active"


@pytest.mark.asyncio
async def test_file_upload_download_and_listing_excludes_payload(client, api_headers):
    owner = await _local_user(client, api_headers, "Ägare Fil", role="superuser")
    ws = await _workspace(client, owner)

    upload = await client.post(
        f"/api/v1/workspaces/{ws['id']}/files",
        files={"file": ("inventering-å.csv", b"namn;system\nGreta;Ekonomi\n", "text/csv")},
        data={"description": "Utkast"},
        headers=owner["headers"],
    )
    assert upload.status_code == 201, upload.text
    meta = upload.json()
    assert meta["size_bytes"] == len(b"namn;system\nGreta;Ekonomi\n")
    assert "data" not in meta

    dl = await client.get(
        f"/api/v1/workspaces/{ws['id']}/files/{meta['id']}/download", headers=owner["headers"]
    )
    assert dl.status_code == 200
    assert dl.content == b"namn;system\nGreta;Ekonomi\n"
    assert "filename*=UTF-8''" in dl.headers["content-disposition"]


@pytest.mark.asyncio
async def test_file_types_are_whitelisted_and_served_as_the_server_decides(client, api_headers):
    owner = await _local_user(client, api_headers, "Ägare Filtyp", role="superuser")
    ws = await _workspace(client, owner)

    for name, ctype in (("sida.html", "text/html"), ("bild.svg", "image/svg+xml"), ("utan-andelse", "text/plain")):
        bad = await client.post(
            f"/api/v1/workspaces/{ws['id']}/files",
            files={"file": (name, b"<script>alert(1)</script>", ctype)},
            headers=owner["headers"],
        )
        assert bad.status_code == 415, name

    # The browser's claim is ignored: a .txt is served as text/plain.
    up = await client.post(
        f"/api/v1/workspaces/{ws['id']}/files",
        files={"file": ("anteckning.txt", b"<script>alert(1)</script>", "text/html")},
        headers=owner["headers"],
    )
    assert up.status_code == 201, up.text
    dl = await client.get(
        f"/api/v1/workspaces/{ws['id']}/files/{up.json()['id']}/download", headers=owner["headers"]
    )
    assert dl.headers["content-type"].startswith("text/plain")
    assert dl.headers["x-content-type-options"] == "nosniff"
    assert dl.headers["content-disposition"].startswith("attachment;")


@pytest.mark.asyncio
async def test_links_are_listed_and_only_web_urls_are_accepted(client, api_headers):
    owner = await _local_user(client, api_headers, "Ägare Länk", role="superuser")
    ws = await _workspace(client, owner)

    bad = await client.post(
        f"/api/v1/workspaces/{ws['id']}/links",
        json={"title": "Skript", "url": "javascript:alert(1)"},
        headers=owner["headers"],
    )
    assert bad.status_code == 422

    resp = await client.post(
        f"/api/v1/workspaces/{ws['id']}/links",
        json={"title": "Projektplan", "url": "https://contoso.sharepoint.com/plan", "description": "Utkast"},
        headers=owner["headers"],
    )
    assert resp.status_code == 201, resp.text
    link = resp.json()
    assert link["url"] == "https://contoso.sharepoint.com/plan"
    assert link["filename"] == "Projektplan"

    listed = await client.get(f"/api/v1/workspaces/{ws['id']}/files", headers=owner["headers"])
    assert [f["url"] for f in listed.json()] == ["https://contoso.sharepoint.com/plan"]

    dl = await client.get(
        f"/api/v1/workspaces/{ws['id']}/files/{link['id']}/download", headers=owner["headers"]
    )
    assert dl.status_code == 404


@pytest.mark.asyncio
async def test_replies_are_one_level_and_authors_own_their_posts(client, api_headers):
    owner = await _local_user(client, api_headers, "Ägare Forum", role="superuser")
    member = await _local_user(client, api_headers, "Medlem Forum")
    ws = await _workspace(client, owner, member_ids=[member["id"]])

    post = await client.post(
        f"/api/v1/workspaces/{ws['id']}/posts",
        json={"body": "Hur delar vi upp inventeringen?"},
        headers=owner["headers"],
    )
    assert post.status_code == 201
    root_id = post.json()["id"]

    reply = await client.post(
        f"/api/v1/workspaces/{ws['id']}/posts",
        json={"body": "Jag tar ekonomisystemen.", "parent_id": root_id},
        headers=member["headers"],
    )
    assert reply.status_code == 201

    nested = await client.post(
        f"/api/v1/workspaces/{ws['id']}/posts",
        json={"body": "Svar på svar", "parent_id": reply.json()["id"]},
        headers=member["headers"],
    )
    assert nested.status_code == 400

    # A member cannot edit someone else's post; the owner moderates
    denied = await client.patch(
        f"/api/v1/workspaces/{ws['id']}/posts/{root_id}",
        json={"body": "Ändrat"},
        headers=member["headers"],
    )
    assert denied.status_code == 403

    moderated = await client.delete(
        f"/api/v1/workspaces/{ws['id']}/posts/{reply.json()['id']}", headers=owner["headers"]
    )
    assert moderated.status_code == 204


@pytest.mark.asyncio
async def test_task_assignee_can_be_cleared_and_completion_is_stamped(client, api_headers):
    owner = await _local_user(client, api_headers, "Ägare Uppgift", role="superuser")
    ws = await _workspace(client, owner)

    created = await client.post(
        f"/api/v1/workspaces/{ws['id']}/tasks",
        json={"title": "Sammanställ resultat", "assignee_user_id": owner["id"], "due_date": "2026-09-30"},
        headers=owner["headers"],
    )
    task_id = created.json()["id"]

    done = await client.patch(
        f"/api/v1/workspaces/{ws['id']}/tasks/{task_id}",
        json={"status": "done", "assignee_user_id": None, "due_date": None},
        headers=owner["headers"],
    )
    assert done.status_code == 200
    body = done.json()
    assert body["status"] == "done"
    assert body["assignee_user_id"] is None
    assert body["due_date"] is None
    assert body["completed_at"] is not None


@pytest.mark.asyncio
async def test_admin_keeps_owner_rights_everywhere(client, api_headers):
    owner = await _local_user(client, api_headers, "Ägare Adminprov", role="superuser")
    admin = await _local_user(client, api_headers, "Admin Provsson", role="admin")
    ws = await _workspace(client, owner, name="Uppdrag utan admin")

    # Not a member, still sees the private uppdrag as owner
    seen = await client.get(f"/api/v1/workspaces/{ws['id']}", headers=admin["headers"])
    assert seen.status_code == 200
    assert seen.json()["my_role"] == "owner"
    assert seen.json()["is_member"] is False

    # A reader membership does not take rights away from an admin
    await client.post(
        f"/api/v1/workspaces/{ws['id']}/members",
        json={"user_id": admin["id"], "role": "reader"},
        headers=owner["headers"],
    )
    after = await client.get(f"/api/v1/workspaces/{ws['id']}", headers=admin["headers"])
    assert after.json()["my_role"] == "owner"
    assert after.json()["is_member"] is True

    posted = await client.post(
        f"/api/v1/workspaces/{ws['id']}/posts",
        json={"body": "Admin kan skriva"},
        headers=admin["headers"],
    )
    assert posted.status_code == 201


@pytest.mark.asyncio
async def test_meeting_notes_keep_their_template_and_date(client, api_headers):
    owner = await _local_user(client, api_headers, "Ägare Möte", role="superuser")
    ws = await _workspace(client, owner)

    created = await client.post(
        f"/api/v1/workspaces/{ws['id']}/meetings",
        json={
            "title": "Uppstartsmöte inventering",
            "meeting_date": "2026-09-01",
            "template": "kickoff",
            "body": "## Deltagare\n\n- Håkan\n",
        },
        headers=owner["headers"],
    )
    assert created.status_code == 201, created.text
    meeting = created.json()
    assert meeting["template"] == "kickoff"
    assert meeting["meeting_date"] == "2026-09-01"

    listed = await client.get(f"/api/v1/workspaces/{ws['id']}/meetings", headers=owner["headers"])
    assert [m["id"] for m in listed.json()] == [meeting["id"]]
    assert "body" not in listed.json()[0]

    # The date can be cleared; the template stays what the notes started from
    cleared = await client.patch(
        f"/api/v1/workspaces/{ws['id']}/meetings/{meeting['id']}",
        json={"meeting_date": None, "body": "## Deltagare\n\n- Håkan\n- Tina\n"},
        headers=owner["headers"],
    )
    assert cleared.status_code == 200
    assert cleared.json()["meeting_date"] is None
    assert cleared.json()["template"] == "kickoff"
    assert "Tina" in cleared.json()["body"]


@pytest.mark.asyncio
async def test_readers_cannot_write_meeting_notes(client, api_headers):
    owner = await _local_user(client, api_headers, "Ägare Mötesläs", role="superuser")
    reader = await _local_user(client, api_headers, "Läsare Möte")
    ws = await _workspace(client, owner, member_ids=[reader["id"]])
    await client.patch(
        f"/api/v1/workspaces/{ws['id']}/members/{reader['id']}",
        json={"role": "reader"},
        headers=owner["headers"],
    )

    denied = await client.post(
        f"/api/v1/workspaces/{ws['id']}/meetings",
        json={"title": "Smygmöte", "template": "status", "body": ""},
        headers=reader["headers"],
    )
    assert denied.status_code == 403

    # …but reading them is fine
    listed = await client.get(f"/api/v1/workspaces/{ws['id']}/meetings", headers=reader["headers"])
    assert listed.status_code == 200


# ── Arbetsgrupper och kalender ───────────────────────────────────────────────

async def _workgroup(client, owner, **overrides) -> dict:
    """A standing arbetsgrupp: internal, so every signed-in user may read it."""
    payload = {
        "name": "Affärsstöd",
        "description": "Provgrupp",
        "kind": "arbetsgrupp",
        "visibility": "internal",
    }
    payload.update(overrides)
    resp = await client.post("/api/v1/workspaces", json=payload, headers=owner["headers"])
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_workgroups_and_uppdrag_are_listed_apart(client, api_headers):
    owner = await _local_user(client, api_headers, "Ägare Bådadera", role="superuser")
    uppdrag = await _workspace(client, owner, name="Ett uppdrag")
    grupp = await _workgroup(client, owner, name="Fastighet")

    assert uppdrag["kind"] == "uppdrag"
    assert grupp["kind"] == "arbetsgrupp"

    groups = await client.get(
        "/api/v1/workspaces", params={"kind": "arbetsgrupp"}, headers=owner["headers"]
    )
    assert groups.status_code == 200
    ids = [w["id"] for w in groups.json()]
    assert grupp["id"] in ids and uppdrag["id"] not in ids

    assignments = await client.get(
        "/api/v1/workspaces", params={"kind": "uppdrag"}, headers=owner["headers"]
    )
    ids = [w["id"] for w in assignments.json()]
    assert uppdrag["id"] in ids and grupp["id"] not in ids


@pytest.mark.asyncio
async def test_everyone_reads_a_workgroup_but_only_deltagare_write(client, api_headers):
    owner = await _local_user(client, api_headers, "Ägare Grupp", role="superuser")
    deltagare = await _local_user(client, api_headers, "Deltagare Provsson")
    outsider = await _local_user(client, api_headers, "Utanför Provsson")
    grupp = await _workgroup(client, owner, name="Bostad", member_ids=[deltagare["id"]])

    # Anyone signed in sees it in the list and may open it…
    listed = await client.get(
        "/api/v1/workspaces", params={"kind": "arbetsgrupp"}, headers=outsider["headers"]
    )
    assert grupp["id"] in [w["id"] for w in listed.json()]
    read = await client.get(f"/api/v1/workspaces/{grupp['id']}", headers=outsider["headers"])
    assert read.status_code == 200
    assert read.json()["my_role"] == "reader"

    # …but writing is for the deltagare.
    denied = await client.post(
        f"/api/v1/workspaces/{grupp['id']}/events",
        json={"title": "Smygmöte", "starts_at": "2026-09-01T09:00:00+02:00"},
        headers=outsider["headers"],
    )
    assert denied.status_code == 403

    allowed = await client.post(
        f"/api/v1/workspaces/{grupp['id']}/events",
        json={"title": "Gruppmöte", "starts_at": "2026-09-01T09:00:00+02:00"},
        headers=deltagare["headers"],
    )
    assert allowed.status_code == 201


@pytest.mark.asyncio
async def test_calendar_event_crud(client, api_headers):
    owner = await _local_user(client, api_headers, "Ägare Kalender", role="superuser")
    ws = await _workspace(client, owner, name="Uppdrag med kalender")

    created = await client.post(
        f"/api/v1/workspaces/{ws['id']}/events",
        json={
            "title": "Avstämning",
            "starts_at": "2026-09-02T09:00:00+02:00",
            "ends_at": "2026-09-02T10:00:00+02:00",
            "location": "Teams",
        },
        headers=owner["headers"],
    )
    assert created.status_code == 201, created.text
    event = created.json()
    assert event["all_day"] is False
    assert event["location"] == "Teams"

    listed = await client.get(f"/api/v1/workspaces/{ws['id']}/events", headers=owner["headers"])
    assert [e["id"] for e in listed.json()] == [event["id"]]

    # An explicit null clears the end time; the other fields stay put.
    patched = await client.patch(
        f"/api/v1/workspaces/{ws['id']}/events/{event['id']}",
        json={"ends_at": None, "all_day": True},
        headers=owner["headers"],
    )
    assert patched.status_code == 200
    assert patched.json()["ends_at"] is None
    assert patched.json()["all_day"] is True
    assert patched.json()["title"] == "Avstämning"

    deleted = await client.delete(
        f"/api/v1/workspaces/{ws['id']}/events/{event['id']}", headers=owner["headers"]
    )
    assert deleted.status_code == 204
    empty = await client.get(f"/api/v1/workspaces/{ws['id']}/events", headers=owner["headers"])
    assert empty.json() == []


@pytest.mark.asyncio
async def test_event_end_before_start_is_rejected(client, api_headers):
    owner = await _local_user(client, api_headers, "Ägare Bakvänt", role="superuser")
    ws = await _workspace(client, owner, name="Uppdrag med bakvänd tid")

    resp = await client.post(
        f"/api/v1/workspaces/{ws['id']}/events",
        json={
            "title": "Bakvänt",
            "starts_at": "2026-09-02T10:00:00+02:00",
            "ends_at": "2026-09-02T09:00:00+02:00",
        },
        headers=owner["headers"],
    )
    assert resp.status_code == 400

    ok = await client.post(
        f"/api/v1/workspaces/{ws['id']}/events",
        json={"title": "Rättvänt", "starts_at": "2026-09-02T09:00:00+02:00"},
        headers=owner["headers"],
    )
    assert ok.status_code == 201
    bad_patch = await client.patch(
        f"/api/v1/workspaces/{ws['id']}/events/{ok.json()['id']}",
        json={"ends_at": "2026-09-01T09:00:00+02:00"},
        headers=owner["headers"],
    )
    assert bad_patch.status_code == 400
