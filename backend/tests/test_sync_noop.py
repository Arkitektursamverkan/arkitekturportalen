"""A sync that re-sends unchanged records must not fill the audit log.

Every sync re-sends every record. Before this was fixed, each one became an
UPDATE row with identical before/after, and synced processes flipped between
parent_prefix/parent_name and parent_id — two real-looking rows per process
per sync.
"""
from __future__ import annotations

import uuid
from typing import Any

import pytest
from sqlalchemy import func, select

from app.api.v1 import sync as sync_module
from app.api.v1.sync import SyncProfile, _run_sync
from app.models.audit import AuditLogORM
from app.schemas.common import ExternalSource, NodeType
from app.schemas.node import NodeCreate, NodeUpdate


async def _audit_rows(repo, node_id) -> list[AuditLogORM]:
    async with repo._session_factory() as s:
        q = select(AuditLogORM).where(AuditLogORM.entity_id == node_id).order_by(AuditLogORM.created_at)
        return list((await s.execute(q)).scalars().all())


async def _update_rows_for(repo, external_prefix: str) -> int:
    async with repo._session_factory() as s:
        q = select(func.count()).select_from(AuditLogORM).where(
            AuditLogORM.action == "UPDATE",
            AuditLogORM.snapshot_after["external_id"].astext.like(f"{external_prefix}%"),
        )
        return (await s.execute(q)).scalar_one()


@pytest.mark.asyncio
async def test_upsert_unchanged_writes_no_audit_row(repo):
    ext_id = f"test:{uuid.uuid4()}"
    data = NodeCreate(
        type=NodeType.INFORMATION_OBJECT, name="Skadeärende", description="Materiell/personskada",
        external_source=ExternalSource.SHAREPOINT, external_id=ext_id, attributes={},
    )
    node, created = await repo.upsert_node_by_external("SHAREPOINT", ext_id, data)
    assert created
    await repo.upsert_node_by_external("SHAREPOINT", ext_id, data)
    assert [r.action for r in await _audit_rows(repo, node.id)] == ["CREATE"]

    changed = data.model_copy(update={"description": "Ny beskrivning"})
    await repo.upsert_node_by_external("SHAREPOINT", ext_id, changed)
    assert [r.action for r in await _audit_rows(repo, node.id)] == ["CREATE", "UPDATE"]


@pytest.mark.asyncio
async def test_update_node_unchanged_writes_no_audit_row(repo):
    node = await repo.create_node(NodeCreate(type=NodeType.APPLICATION, name=f"App {uuid.uuid4()}"))
    await repo.update_node(node.id, NodeUpdate(name=node.name))
    assert [r.action for r in await _audit_rows(repo, node.id)] == ["CREATE"]


class _FakeResponse:
    status_code = 200

    def __init__(self, records: list[dict[str, Any]]) -> None:
        self._records = records

    def json(self) -> dict[str, Any]:
        return {"records": self._records, "page_size": 500, "total": len(self._records)}


@pytest.mark.asyncio
async def test_resync_of_processes_is_quiet(repo, monkeypatch):
    flow_id = f"flow-{uuid.uuid4()}"
    records = [
        {"external_id": "1", "data": {"name": "Förvalta", "prefix": f"{flow_id}-1", "parent_prefix": ""}},
        {"external_id": "2", "data": {"name": "Ärendemottagning", "prefix": f"{flow_id}-1.1", "parent_prefix": f"{flow_id}-1"}},
        {"external_id": "3", "data": {"name": "Besiktning", "prefix": f"{flow_id}-1.2", "parent_name": "Förvalta"}},
    ]

    class FakeClient:
        def __init__(self, *a, **kw) -> None: ...
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def get(self, *a, **kw): return _FakeResponse(records)

    monkeypatch.setattr(sync_module.httpx, "AsyncClient", FakeClient)
    monkeypatch.setenv("INTEGRATION_PLATFORM_URL", "http://platform.test/api/v1")
    profile = SyncProfile(
        flow_id=flow_id, node_type="Process", external_source_label="SHAREPOINT", platform_api_key="k",
        mappings=[
            {"source_field": "name", "target": "name"},
            {"source_field": "prefix", "target": "attr:prefix"},
            {"source_field": "parent_prefix", "target": "attr:parent_prefix"},
            {"source_field": "parent_name", "target": "attr:parent_name"},
        ],
    )

    await _run_sync(profile, repo)
    procs = {p.name: p for p in await repo.list_nodes(external_source="SHAREPOINT", limit=10000)
             if p.external_id and p.external_id.startswith(f"{flow_id}:")}
    root = str(procs["Förvalta"].id)
    assert procs["Ärendemottagning"].attributes.get("parent_id") == root
    assert procs["Besiktning"].attributes.get("parent_id") == root
    first_run_updates = await _update_rows_for(repo, f"{flow_id}:")

    await _run_sync(profile, repo)
    await _run_sync(profile, repo)
    assert await _update_rows_for(repo, f"{flow_id}:") == first_run_updates
    procs = {p.name: p for p in await repo.list_nodes(external_source="SHAREPOINT", limit=10000)
             if p.external_id and p.external_id.startswith(f"{flow_id}:")}
    assert procs["Ärendemottagning"].attributes == {"prefix": f"{flow_id}-1.1", "parent_id": root}
    assert procs["Besiktning"].attributes.get("parent_id") == root


@pytest.mark.asyncio
async def test_container_for_prefixless_processes_stays(repo, monkeypatch):
    """The container was archived every run that found no new orphan and
    restored by the next – one "removed" and one "added" per pair of runs."""
    flow_id = f"flow-{uuid.uuid4()}"
    records = [
        {"external_id": "1", "data": {"name": f"Utan prefix A {flow_id}", "prefix": ""}},
        {"external_id": "2", "data": {"name": f"Utan prefix B {flow_id}", "prefix": ""}},
    ]

    class FakeClient:
        def __init__(self, *a, **kw) -> None: ...
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def get(self, *a, **kw): return _FakeResponse(records)

    monkeypatch.setattr(sync_module.httpx, "AsyncClient", FakeClient)
    monkeypatch.setenv("INTEGRATION_PLATFORM_URL", "http://platform.test/api/v1")
    profile = SyncProfile(
        flow_id=flow_id, node_type="Process", external_source_label="2C8", platform_api_key="k",
        mappings=[{"source_field": "name", "target": "name"}, {"source_field": "prefix", "target": "attr:prefix"}],
    )
    container_ext = f"{flow_id}:__no_prefix__"

    async def container(archived: bool):
        nodes = await repo.list_nodes(node_type="Process", external_source="2C8", archived=archived, limit=10000)
        return next((n for n in nodes if n.external_id == container_ext), None)

    await _run_sync(profile, repo)
    node = await container(archived=False)
    assert node is not None
    for _ in range(3):
        await _run_sync(profile, repo)
        assert await container(archived=False) is not None
    # Created once, never archived or restored after that.
    assert [r.action for r in await _audit_rows(repo, node.id)] == ["CREATE"]
    assert await _update_rows_for(repo, f"{flow_id}:") == 2  # the two processes got their parent, once

    # When the source no longer holds any process for it, the container goes.
    records.clear()
    records.append({"external_id": "3", "data": {"name": f"Med prefix {flow_id}", "prefix": f"{flow_id}-1"}})
    await _run_sync(profile, repo)
    assert await container(archived=False) is None
    assert await container(archived=True) is not None


@pytest.mark.asyncio
async def test_usage_statistics_leave_out_sync(repo):
    before = await repo.get_usage_statistics(period_days=7)
    ext_id = f"test:{uuid.uuid4()}"
    data = NodeCreate(
        type=NodeType.APPLICATION, name=f"Synkad {uuid.uuid4()}",
        external_source=ExternalSource.SHAREPOINT, external_id=ext_id,
    )
    await repo.upsert_node_by_external("SHAREPOINT", ext_id, data)
    await repo.upsert_node_by_external("SHAREPOINT", ext_id, data.model_copy(update={"description": "ändrad"}))
    after_sync = await repo.get_usage_statistics(period_days=7)
    assert after_sync.by_action["CREATE"] == before.by_action["CREATE"]
    assert after_sync.by_action["UPDATE"] == before.by_action["UPDATE"]

    await repo.create_node(NodeCreate(type=NodeType.APPLICATION, name=f"Manuell {uuid.uuid4()}"))
    after_manual = await repo.get_usage_statistics(period_days=7)
    assert after_manual.by_action["CREATE"] == before.by_action["CREATE"] + 1
