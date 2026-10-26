"""Tests for editable PDF footer metadata."""
from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy import text


@pytest_asyncio.fixture(autouse=True)
async def _clean(repo):
    async with repo._engine.begin() as conn:
        await conn.execute(text("TRUNCATE ea_document_version RESTART IDENTITY CASCADE"))
        await conn.execute(text("DELETE FROM ea_audit_log"))
        await conn.execute(text("DELETE FROM ea_target_architecture"))
        await conn.execute(text("DELETE FROM ea_principle_document"))
        await conn.execute(text("DELETE FROM ea_document_metadata"))
        # Re-seed defaults that the alembic migration would normally provide
        for doc_type in ("target_architecture", "principle_document"):
            await conn.execute(
                text(
                    "INSERT INTO ea_document_metadata (document_type, entries) "
                    "VALUES (:t, CAST(:e AS jsonb))"
                ).bindparams(
                    t=doc_type,
                    e='[{"label":"Ansvarig","value":"Enterprise Architect"},'
                      '{"label":"Avdelning/enhet","value":"IT"},'
                      '{"label":"Dokumentkategori","value":"Rutiner"}]',
                ),
            )
    yield


@pytest.mark.asyncio
async def test_get_metadata_returns_defaults(client, api_headers):
    resp = await client.get(
        "/api/v1/document-metadata/target_architecture", headers=api_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["document_type"] == "target_architecture"
    labels = [e["label"] for e in data["entries"]]
    assert "Ansvarig" in labels
    assert "Avdelning/enhet" in labels
    assert "Dokumentkategori" in labels


@pytest.mark.asyncio
async def test_get_metadata_unknown_type(client, api_headers):
    resp = await client.get(
        "/api/v1/document-metadata/something_else", headers=api_headers
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_put_metadata_replaces_entries(client, api_headers):
    resp = await client.put(
        "/api/v1/document-metadata/target_architecture",
        json={
            "entries": [
                {"label": "Ansvarig", "value": "Anna Andersson"},
                {"label": "Förvaltningsobjekt", "value": "IT-styrning"},
            ]
        },
        headers=api_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert [e["label"] for e in data["entries"]] == ["Ansvarig", "Förvaltningsobjekt"]
    assert data["entries"][0]["value"] == "Anna Andersson"


@pytest.mark.asyncio
async def test_metadata_is_snapshotted_into_version(client, api_headers, repo):
    """A version's snapshot freezes the metadata at the time of creation."""
    # Set initial metadata + create version 0.1
    await client.put(
        "/api/v1/document-metadata/target_architecture",
        json={"entries": [{"label": "Ansvarig", "value": "Person A"}]},
        headers=api_headers,
    )
    await client.put(
        "/api/v1/target-architecture",
        json={"sections": []},
        headers=api_headers,
    )
    first = await client.get(
        "/api/v1/target-architecture/export", headers=api_headers
    )
    assert first.headers["x-document-version"] == "0.1"

    # Change metadata — should NOT bump version (metadata change is not a
    # content audit-entry). New export should still serve 0.1.
    await client.put(
        "/api/v1/document-metadata/target_architecture",
        json={"entries": [{"label": "Ansvarig", "value": "Person B"}]},
        headers=api_headers,
    )
    second = await client.get(
        "/api/v1/target-architecture/export", headers=api_headers
    )
    assert second.headers["x-document-version"] == "0.1"

    # The freeze: version row's snapshot must still contain Person A
    # even though the live metadata is now Person B.
    from uuid import UUID

    from sqlalchemy import text as _t
    versions = await client.get(
        "/api/v1/target-architecture/versions", headers=api_headers
    )
    latest_id = versions.json()["latest"]["id"]
    async with repo._engine.begin() as conn:
        row = (await conn.execute(
            _t("SELECT snapshot->'metadata_entries' AS m FROM ea_document_version WHERE id = :i")
            .bindparams(i=UUID(latest_id))
        )).first()
    entries = row.m
    assert any(e["value"] == "Person A" for e in entries)
    assert not any(e["value"] == "Person B" for e in entries)
