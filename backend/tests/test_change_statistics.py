"""Förändringsstatistik (modulen "changes"): objektens historik ur revisionsloggen.

Kontraktet som låses här:
- Skapat och återställt ur arkivet räknas som tillagt; raderat och arkiverat
  som borttaget; övriga ändringar som uppdaterat, med de fält som ändrats.
- En sparning som inte ändrar något syns inte.
- Antalet objekt vid periodens slut räknas fram från dagens antal.
- Bara objekt användaren får se: utan behörighet till servrar syns inga
  serverhändelser och inga servrar i antalen.
- Vem som ändrat visas bara för administratörer; att en synkning gjort det
  syns för alla.
- När modulen är på tömmer "Töm revisionsloggen" inte objekthistoriken.
"""
import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select

from app.auth import issue_local_token
from app.config import settings
from app.dal.postgres_repository import SYNC_AUDIT_USER
from app.models.audit import AuditLogORM
from app.schemas.node import NodeUpdate

URL = "/api/v1/change-statistics"


async def _anvandare(repo, roll: str) -> dict:
    user = await repo.create_local_user(
        name=f"Statistik {roll}", email=f"stat.{roll}.{uuid4().hex[:8]}@example.org", password_hash="x", role=roll,
    )
    return {"Authorization": f"Bearer {issue_local_token(user)}"}


async def _hamta(client, headers, start, end, **params) -> dict:
    resp = await client.get(URL, params={"start": start.isoformat(), "end": end.isoformat(), **params}, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _for(svar: dict, node_id: str) -> list[dict]:
    return [e for e in svar["events"] if e["node_id"] == node_id]


@pytest.mark.asyncio
async def test_handelserna_klassas(client, repo):
    admin = await _anvandare(repo, "admin")
    start = datetime.now(UTC) - timedelta(minutes=1)
    skapad = await client.post("/api/v1/nodes", json={"type": "Application", "name": "Statistiksystemet"}, headers=admin)
    nid = skapad.json()["id"]
    await client.patch(f"/api/v1/nodes/{nid}", json={"name": "Statistiksystemet 2", "attributes": {"agare": "IT"}}, headers=admin)
    await client.patch(f"/api/v1/nodes/{nid}", json={"name": "Statistiksystemet 2"}, headers=admin)  # ingen ändring
    await client.patch(f"/api/v1/nodes/{nid}", json={"archived": True}, headers=admin)
    await client.patch(f"/api/v1/nodes/{nid}", json={"archived": False}, headers=admin)
    await client.request("DELETE", f"/api/v1/nodes/{nid}", json={"reason": "test"}, headers=admin)
    end = datetime.now(UTC) + timedelta(minutes=1)

    svar = await _hamta(client, admin, start, end)
    handelser = _for(svar, nid)
    assert [e["kind"] for e in handelser] == ["added", "updated", "removed", "added", "removed"]
    assert set(handelser[1]["fields"]) == {"name", "agare"}
    assert all(e["type"] == "Application" and e["source"] == "NONE" for e in handelser)
    assert handelser[1]["name"] == "Statistiksystemet 2"
    assert all(e["by"] == "Statistik admin" and not e["by_sync"] for e in handelser)


@pytest.mark.asyncio
async def test_typfilter_och_period(client, repo, api_headers):
    admin = await _anvandare(repo, "admin")
    start = datetime.now(UTC) - timedelta(minutes=1)
    komp = (await client.post("/api/v1/nodes", json={"type": "TechnologyComponent", "name": "Filterkomponent"}, headers=api_headers)).json()["id"]
    proc = (await client.post("/api/v1/nodes", json={"type": "Process", "name": "Filterprocess"}, headers=api_headers)).json()["id"]
    end = datetime.now(UTC) + timedelta(minutes=1)

    bara_teknik = await _hamta(client, admin, start, end, types=["TechnologyComponent"])
    assert _for(bara_teknik, komp) and not _for(bara_teknik, proc)
    assert set(bara_teknik["count_at_end"]) == {"TechnologyComponent"}

    fore = await _hamta(client, admin, start - timedelta(days=1), start)
    assert not _for(fore, komp)

    assert (await client.get(URL, params={"start": end.isoformat(), "end": start.isoformat()}, headers=admin)).status_code == 400
    assert (await client.get(URL, params={"start": start.isoformat(), "end": end.isoformat(), "types": "Hus"}, headers=admin)).status_code == 400


@pytest.mark.asyncio
async def test_antalet_vid_periodens_slut(client, repo, api_headers):
    admin = await _anvandare(repo, "admin")
    start = datetime.now(UTC) - timedelta(minutes=1)
    await client.post("/api/v1/nodes", json={"type": "InformationSource", "name": "Källa A"}, headers=api_headers)
    await asyncio.sleep(0.05)
    mellan = datetime.now(UTC)
    await asyncio.sleep(0.05)
    await client.post("/api/v1/nodes", json={"type": "InformationSource", "name": "Källa B"}, headers=api_headers)
    langt_fram = datetime.now(UTC) + timedelta(days=1)

    da = (await _hamta(client, admin, start, mellan, types=["InformationSource"]))["count_at_end"]["InformationSource"]
    nu = (await _hamta(client, admin, start, langt_fram, types=["InformationSource"]))["count_at_end"]["InformationSource"]
    assert nu - da == 1


@pytest.mark.asyncio
async def test_bara_det_man_far_se(client, repo, api_headers):
    start = datetime.now(UTC) - timedelta(minutes=1)
    server = (await client.post("/api/v1/nodes", json={"type": "Server", "name": "Statistikservern"}, headers=api_headers)).json()["id"]
    app_id = (await client.post("/api/v1/nodes", json={"type": "Application", "name": "Synligt system"}, headers=api_headers)).json()["id"]
    end = datetime.now(UTC) + timedelta(minutes=1)

    lasare = await _anvandare(repo, "user")
    svar = await _hamta(client, lasare, start, end)
    assert not _for(svar, server)
    assert _for(svar, app_id)
    assert all(e["by"] is None for e in svar["events"])
    assert svar["count_at_end"]["Server"] == 0
    assert (await client.get(URL, params={"start": start.isoformat(), "end": end.isoformat()})).status_code == 401


@pytest.mark.asyncio
async def test_synkningen_syns_for_alla(client, repo, api_headers):
    start = datetime.now(UTC) - timedelta(minutes=1)
    nid = (await client.post("/api/v1/nodes", json={"type": "Process", "name": "Synkad process"}, headers=api_headers)).json()["id"]
    await repo.update_node(UUID(nid), NodeUpdate(archived=True), user_name=SYNC_AUDIT_USER)
    end = datetime.now(UTC) + timedelta(minutes=1)

    svar = await _hamta(client, await _anvandare(repo, "user"), start, end)
    borttagen = [e for e in _for(svar, nid) if e["kind"] == "removed"]
    assert borttagen and borttagen[0]["by_sync"] and borttagen[0]["by"] is None


@pytest.mark.asyncio
async def test_tomning_behaller_objekthistoriken(client, repo, api_headers, monkeypatch):
    monkeypatch.setattr(settings, "MODULES", "all")
    nid = (await client.post("/api/v1/nodes", json={"type": "Server", "name": "Kvarvarande historik"}, headers=api_headers)).json()["id"]

    svar = await client.delete("/api/v1/audit", headers=api_headers)
    assert svar.status_code == 200 and svar.json()["kept_node_history"] is True
    async with repo._session_factory() as s:
        kvar = (await s.execute(select(AuditLogORM).where(AuditLogORM.entity_id == nid))).scalars().all()
        ovrigt = (await s.execute(select(AuditLogORM).where(AuditLogORM.entity_type != "node"))).scalars().all()
    assert kvar and not ovrigt
