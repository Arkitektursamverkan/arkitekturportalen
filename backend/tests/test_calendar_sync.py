"""Verksamhetskalendern som synkmål.

Kontraktet som låses här:
- Varje post blir en fastställd engångshändelse på sitt datum.
- En omkörning utan ändringar skriver ingenting, varken i kalendern eller i
  ändringsloggen.
- Bara mappade fält skrivs: det en redaktör lagt till i portalen ligger kvar.
- En post som källan slutat skicka tas bort – men inte när källan svarar tomt,
  och aldrig händelser från ett annat flöde eller skapade i portalen.
- En post med oläsbart datum rapporteras och rör inte den händelse som finns.
"""
from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import func, select

from app.api.v1 import sync as sync_module
from app.api.v1.sync import SyncProfile, _run_sync
from app.models.audit import AuditLogORM
from app.models.calendar_event import CalendarEventORM
from app.services import calendar_sync

MAPPINGS = [
    {"source_field": "title", "target": "name"},
    {"source_field": "note", "target": "description"},
    {"source_field": "date", "target": "attr:start_date"},
    {"source_field": "unit", "target": "attr:responsible"},
    {"source_field": "unit", "target": "attr:departments"},
]


def _rec(ext: str, title: str, day: str, unit: str = "Ekonomi") -> dict:
    return {"external_id": ext, "data": {"title": title, "date": day, "unit": unit, "note": "Ur iTid"}}


async def _events(repo, flow: str) -> dict[str, CalendarEventORM]:
    async with repo._session_factory() as s:
        rows = (await s.execute(
            select(CalendarEventORM).where(CalendarEventORM.external_id.like(f"{flow}:%"))
        )).scalars().all()
    return {e.external_id.split(":", 1)[1]: e for e in rows}


async def _audit_count(repo, event_id) -> int:
    async with repo._session_factory() as s:
        return (await s.execute(
            select(func.count()).select_from(AuditLogORM).where(AuditLogORM.entity_id == event_id)
        )).scalar_one()


async def _sync(repo, flow: str, records: list[dict], prune: bool = True) -> dict:
    return await calendar_sync.sync_events(
        repo, flow_id=flow, external_source="GENERIC_REST", mappings=MAPPINGS, records=records, prune=prune,
    )


@pytest.mark.asyncio
async def test_poster_blir_faststallda_handelser(repo):
    flow = str(uuid.uuid4())
    result = await _sync(repo, flow, [_rec("a", "Periodbyte – Månadsbokslut 2026-11", "2026-11-30")])
    assert (result["created"], result["updated"], result["removed"], result["errors"]) == (1, 0, 0, [])
    e = (await _events(repo, flow))["a"]
    assert e.title == "Periodbyte – Månadsbokslut 2026-11"
    assert (e.start_date, e.recurrence, e.duration_days, e.status) == (date(2026, 11, 30), "once", 1, "approved")
    assert (e.responsible, e.departments, e.description) == ("Ekonomi", ["Ekonomi"], "Ur iTid")
    assert e.external_source == "GENERIC_REST"


@pytest.mark.asyncio
async def test_omkorning_utan_andring_skriver_inget(repo):
    flow = str(uuid.uuid4())
    records = [_rec("a", "Periodbyte", "2026-11-30")]
    await _sync(repo, flow, records)
    e = (await _events(repo, flow))["a"]
    result = await _sync(repo, flow, records)
    assert (result["created"], result["updated"], result["removed"]) == (0, 0, 0)
    assert await _audit_count(repo, e.id) == 1


@pytest.mark.asyncio
async def test_andrat_datum_flyttar_handelsen_och_behaller_portalens_tillagg(repo):
    flow = str(uuid.uuid4())
    await _sync(repo, flow, [_rec("a", "Periodbyte", "2026-11-30")])
    e = (await _events(repo, flow))["a"]
    async with repo._session_factory() as s:
        row = await s.get(CalendarEventORM, e.id)
        row.change_freeze = True
        row.other_dependencies = "Banken"
        await s.commit()

    result = await _sync(repo, flow, [_rec("a", "Periodbyte", "2026-12-01")])
    assert result["updated"] == 1
    after = (await _events(repo, flow))["a"]
    assert after.id == e.id and after.start_date == date(2026, 12, 1)
    assert (after.change_freeze, after.other_dependencies) == (True, "Banken")
    assert await _audit_count(repo, e.id) == 2


@pytest.mark.asyncio
async def test_post_som_forsvunnit_tas_bort_men_inte_andras(repo):
    flow, other = str(uuid.uuid4()), str(uuid.uuid4())
    await _sync(repo, flow, [_rec("a", "Periodbyte", "2026-11-30"), _rec("b", "Hypergene", "2026-12-02")])
    await _sync(repo, other, [_rec("a", "Annat flöde", "2026-12-24")])
    async with repo._session_factory() as s:
        own = CalendarEventORM(title=f"Egen {flow}", start_date=date(2026, 12, 1), status="approved")
        s.add(own)
        await s.commit()
        own_id = own.id

    result = await _sync(repo, flow, [_rec("a", "Periodbyte", "2026-11-30")])
    assert result["removed"] == 1
    assert set(await _events(repo, flow)) == {"a"}
    assert set(await _events(repo, other)) == {"a"}
    async with repo._session_factory() as s:
        assert await s.get(CalendarEventORM, own_id) is not None


@pytest.mark.asyncio
async def test_tomt_svar_och_engangsimport_tar_inte_bort_nagot(repo):
    flow = str(uuid.uuid4())
    await _sync(repo, flow, [_rec("a", "Periodbyte", "2026-11-30"), _rec("b", "Hypergene", "2026-12-02")])
    assert (await _sync(repo, flow, []))["removed"] == 0
    assert (await _sync(repo, flow, [_rec("a", "Periodbyte", "2026-11-30")], prune=False))["removed"] == 0
    assert set(await _events(repo, flow)) == {"a", "b"}


@pytest.mark.asyncio
async def test_olasbart_datum_rapporteras_och_ror_inte_handelsen(repo):
    flow = str(uuid.uuid4())
    await _sync(repo, flow, [_rec("a", "Periodbyte", "2026-11-30")])
    result = await _sync(repo, flow, [_rec("a", "Periodbyte", "snart"), _rec("b", "", "2026-12-02")])
    assert (result["created"], result["updated"], result["removed"]) == (0, 0, 0)
    assert len(result["errors"]) == 2 and "datumet går inte att läsa" in result["errors"][0]
    assert (await _events(repo, flow))["a"].start_date == date(2026, 11, 30)


@pytest.mark.asyncio
async def test_synkprofil_med_kalendern_som_mal(repo, monkeypatch):
    flow = str(uuid.uuid4())
    records = [_rec("a", "Periodbyte", "2026-11-30T00:00:00"), _rec("b", "Hypergene", "2026-12-02")]

    class _Resp:
        status_code = 200

        def json(self):
            return {"records": records, "total": len(records), "page_size": 500}

    class _Client:
        def __init__(self, *a, **k): ...
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def get(self, *a, **k): return _Resp()

    monkeypatch.setattr(sync_module.httpx, "AsyncClient", _Client)
    monkeypatch.setattr(sync_module, "resolve", lambda url: "http://platform.test/api/v1")
    monkeypatch.setattr(sync_module, "key_for", lambda url, key: "k")
    profile = SyncProfile(
        flow_id=flow, node_type="CalendarEvent", external_source_label="generic_rest", mappings=MAPPINGS,
    )
    result = await _run_sync(profile, repo)
    assert (result["total"], result["created"], result["archived"], result["errors"]) == (2, 2, 0, [])
    assert (await _events(repo, flow))["a"].start_date == date(2026, 11, 30)

    records.pop()
    assert (await _run_sync(profile, repo))["archived"] == 1


@pytest.mark.asyncio
async def test_kalendern_finns_bland_importmalen(client, api_headers):
    r = await client.get("/api/v1/import/platform/node-types", headers=api_headers)
    assert r.status_code == 200
    target = next(t for t in r.json()["node_types"] if t["type"] == "CalendarEvent")
    assert {f["target"] for f in target["suggested_attributes"]} >= {"attr:start_date", "attr:responsible"}
