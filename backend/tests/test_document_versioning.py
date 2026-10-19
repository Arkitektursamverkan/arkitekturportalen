"""Tests for document versioning and PDF export."""
from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy import text


@pytest_asyncio.fixture(autouse=True)
async def _clean_document_state(repo):
    """Reset document/version/audit state so each test starts fresh."""
    async with repo._engine.begin() as conn:
        await conn.execute(text("TRUNCATE ea_document_version RESTART IDENTITY CASCADE"))
        await conn.execute(text("DELETE FROM ea_audit_log"))
        await conn.execute(text("DELETE FROM ea_target_architecture"))
        await conn.execute(text("DELETE FROM ea_principle_document"))
    yield


# ─── Helpers ──────────────────────────────────────────────────────────────────


async def _put_target_arch(client, api_headers, *, body_text: str = "Initial body"):
    payload = {
        "sections": [
            {
                "id": "background",
                "kind": "text",
                "title": "Bakgrund",
                "body": body_text,
            }
        ]
    }
    return await client.put(
        "/api/v1/target-architecture",
        json=payload,
        headers=api_headers,
    )


async def _patch_principle_doc(client, api_headers, **fields):
    return await client.patch(
        "/api/v1/principle-document",
        json=fields,
        headers=api_headers,
    )


# ─── Audit on TA/principle doc writes ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_ta_update_writes_audit(client, api_headers):
    resp = await _put_target_arch(client, api_headers, body_text="v1")
    assert resp.status_code == 200

    audit = await client.get(
        "/api/v1/audit",
        params={"entity_type": "target_architecture"},
        headers=api_headers,
    )
    assert audit.status_code == 200
    items = audit.json()["items"]
    assert len(items) >= 1
    assert items[0]["entity_type"] == "target_architecture"
    assert items[0]["entity_name"] == "Målarkitektur"


@pytest.mark.asyncio
async def test_principle_doc_update_writes_audit(client, api_headers):
    resp = await _patch_principle_doc(client, api_headers, introduction="Hej")
    assert resp.status_code == 200

    audit = await client.get(
        "/api/v1/audit",
        params={"entity_type": "principle_document"},
        headers=api_headers,
    )
    assert audit.status_code == 200
    items = audit.json()["items"]
    assert len(items) >= 1
    assert items[0]["entity_type"] == "principle_document"


@pytest.mark.asyncio
async def test_ta_update_with_change_note(client, api_headers):
    resp = await client.put(
        "/api/v1/target-architecture",
        json={"sections": []},
        params={"change_note": "Tömde bakgrund"},
        headers=api_headers,
    )
    assert resp.status_code == 200
    audit = await client.get(
        "/api/v1/audit",
        params={"entity_type": "target_architecture"},
        headers=api_headers,
    )
    items = audit.json()["items"]
    assert items[0]["change_note"] == "Tömde bakgrund"


# ─── Version-bump behavior ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_version_bumps_minor_on_first_export_after_changes(client, api_headers):
    await _put_target_arch(client, api_headers, body_text="r1")
    resp = await client.get(
        "/api/v1/target-architecture/export", headers=api_headers
    )
    assert resp.status_code == 200
    assert resp.headers["x-document-version"] == "0.1"
    assert resp.headers["content-type"].startswith("application/pdf")
    assert len(resp.content) > 1000  # non-trivial PDF


@pytest.mark.asyncio
async def test_version_unchanged_when_no_new_changes(client, api_headers):
    await _put_target_arch(client, api_headers, body_text="r1")
    first = await client.get("/api/v1/target-architecture/export", headers=api_headers)
    assert first.headers["x-document-version"] == "0.1"

    second = await client.get("/api/v1/target-architecture/export", headers=api_headers)
    assert second.headers["x-document-version"] == "0.1"


@pytest.mark.asyncio
async def test_version_bumps_minor_again_after_changes(client, api_headers):
    await _put_target_arch(client, api_headers, body_text="r1")
    await client.get("/api/v1/target-architecture/export", headers=api_headers)

    await _put_target_arch(client, api_headers, body_text="r2")
    resp = await client.get(
        "/api/v1/target-architecture/export", headers=api_headers
    )
    assert resp.headers["x-document-version"] == "0.2"


@pytest.mark.asyncio
async def test_major_bump(client, api_headers):
    await _put_target_arch(client, api_headers, body_text="r1")
    resp = await client.get(
        "/api/v1/target-architecture/export",
        params={"bump": "major"},
        headers=api_headers,
    )
    assert resp.status_code == 200
    assert resp.headers["x-document-version"] == "1.0"


@pytest.mark.asyncio
async def test_multiple_changes_collapse_into_one_minor_bump(client, api_headers):
    await _put_target_arch(client, api_headers, body_text="r1")
    await _put_target_arch(client, api_headers, body_text="r2")
    await _put_target_arch(client, api_headers, body_text="r3")
    resp = await client.get(
        "/api/v1/target-architecture/export", headers=api_headers
    )
    assert resp.headers["x-document-version"] == "0.1"


@pytest.mark.asyncio
async def test_versions_endpoint_lists_versions_and_pending(client, api_headers):
    await _put_target_arch(client, api_headers, body_text="r1")
    await client.get("/api/v1/target-architecture/export", headers=api_headers)
    await _put_target_arch(client, api_headers, body_text="r2")

    resp = await client.get(
        "/api/v1/target-architecture/versions", headers=api_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["latest"]["version_minor"] == 1
    assert data["pending_changes"] >= 1


# ─── PDF rendering ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_principle_document_export_renders_pdf(client, api_headers):
    await _patch_principle_doc(client, api_headers, introduction="Inledningstext")
    resp = await client.get(
        "/api/v1/principle-document/export", headers=api_headers
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/pdf")
    assert resp.content.startswith(b"%PDF")
    assert len(resp.content) > 1000
