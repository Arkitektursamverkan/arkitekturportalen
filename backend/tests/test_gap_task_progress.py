"""GAP tasks carry a weight (omfattning) that drives partial progress."""
from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy import text


@pytest_asyncio.fixture(autouse=True)
async def _clean_gap_tasks(repo):
    async with repo._engine.begin() as conn:
        await conn.execute(text("DELETE FROM ea_gap_tasks"))
        await conn.execute(text("DELETE FROM ea_gap_status_log"))
    yield


async def _task(client, api_headers, **fields):
    resp = await client.post("/api/v1/gap-tasks", json={"gap_item_id": "gap-x", **fields}, headers=api_headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_summary_sums_weights_by_status(client, api_headers):
    big = await _task(client, api_headers, title="Stor", weight=3, horizon="3-6")
    small = await _task(client, api_headers, title="Liten")
    medium = await _task(client, api_headers, title="Medel", weight=2)
    dropped = await _task(client, api_headers, title="Avbruten", weight=3)
    assert big["weight"] == 3 and big["horizon"] == "3-6"
    assert small["weight"] == 1

    for task, status in ((big, "done"), (medium, "in_progress"), (dropped, "cancelled")):
        resp = await client.patch(f"/api/v1/gap-tasks/{task['id']}", json={"status": status}, headers=api_headers)
        assert resp.status_code == 200

    s = (await client.get("/api/v1/gap-tasks/summary", headers=api_headers)).json()["by_item"]["gap-x"]
    assert s["weight_active"] == 6
    assert s["weight_done"] == 3
    assert s["weight_in_progress"] == 2


@pytest.mark.asyncio
async def test_weight_out_of_range_is_rejected(client, api_headers):
    resp = await client.post(
        "/api/v1/gap-tasks", json={"gap_item_id": "gap-x", "title": "t", "weight": 4}, headers=api_headers,
    )
    assert resp.status_code == 422


def test_pdf_domain_bar_counts_partial_progress():
    from app.services.pdf.renderer import _jinja_env

    items = [
        {"id": "a", "domain": "Arkitekturstyrning", "objekt": "A", "gap_typ": "uppfyller_malbild", "prioritet": ""},
        {"id": "b", "domain": "Arkitekturstyrning", "objekt": "B", "gap_typ": "otillrackligt", "prioritet": "HOG"},
    ]
    snapshot = {"content": {"items": items}, "task_progress": {"b": {"done": 1, "active": 4}}}
    html = _jinja_env.get_template("gap_analys.html").render(snapshot=snapshot)
    # (1 + 1/4) / 2 = 62.5 % → 62 or 63 depending on rounding; fulfilled count stays 1/2.
    assert "1/2 uppfyllda" in html
    assert "width: 62%" in html or "width: 63%" in html

    # Older snapshots without task_progress fall back to fulfilled items only.
    html = _jinja_env.get_template("gap_analys.html").render(snapshot={"content": {"items": items}})
    assert "width: 50%" in html


@pytest.mark.asyncio
async def test_task_status_change_is_logged_with_comment(client, api_headers):
    task = await _task(client, api_headers, title="Införa arkitekturforum")
    url = f"/api/v1/gap-tasks/{task['id']}"
    await client.patch(url, json={"status": "done", "status_comment": "Första mötet hölls 20/9"}, headers=api_headers)
    # Changing other fields, or setting the same status again, adds nothing.
    await client.patch(url, json={"title": "Nytt namn", "status": "done"}, headers=api_headers)

    log = (await client.get("/api/v1/gap-tasks/status-log", params={"gap_item_id": "gap-x"}, headers=api_headers)).json()
    assert len(log) == 1
    assert log[0]["task_id"] == task["id"]
    assert log[0]["task_title"] == "Införa arkitekturforum"
    assert (log[0]["from_status"], log[0]["to_status"]) == ("todo", "done")
    assert log[0]["comment"] == "Första mötet hölls 20/9"


@pytest.mark.asyncio
async def test_gap_typ_change_can_be_logged(client, api_headers):
    resp = await client.post(
        "/api/v1/gap-tasks/status-log",
        json={"gap_item_id": "gap-x", "from_status": "otillrackligt", "to_status": "uppfyller_malbild",
              "comment": "  Målbilden uppnådd i och med nya forumet  "},
        headers=api_headers,
    )
    assert resp.status_code == 201
    log = (await client.get("/api/v1/gap-tasks/status-log", params={"gap_item_id": "gap-x"}, headers=api_headers)).json()
    assert [e["to_status"] for e in log] == ["uppfyller_malbild"]
    assert log[0]["task_id"] is None
    assert log[0]["comment"] == "Målbilden uppnådd i och med nya forumet"
