"""Inkorgens borttagningsmeddelanden – går de att kvittera?

REGRESSION: kortet "Borttagna objekt" var det enda i inkorgen utan någon
åtgärd alls. De fyra andra avdelningarna bär en status som granskaren kan
flytta (pending → hanterad), men ea_node_deletion_logs är en ren logg – och
raden räknas ändå in i "N öppna ärenden att hantera" och i klockan i toppraden.
Ärendet kunde alltså aldrig hanteras och båda räknarna stod tända för gott.

Kontraktet som låses här: notisen går att ta bort, och REVISIONSSPÅRET
överlever den. ea_audit_log är arkivet, ea_node_deletion_logs är bara notisen.
"""
from uuid import UUID

import pytest
from sqlalchemy import select

from app.models.audit import AuditLogORM


async def _radera_nod(client, api_headers, namn: str) -> str:
    """Skapar en nod och tar bort den – vilket lägger en notis i inkorgen."""
    skapad = await client.post(
        "/api/v1/nodes",
        json={"type": "Application", "name": namn},
        headers=api_headers,
    )
    assert skapad.status_code == 201
    node_id = skapad.json()["id"]
    borttagen = await client.request(
        "DELETE",
        f"/api/v1/nodes/{node_id}",
        json={"reason": "ersatt av annat system"},
        headers=api_headers,
    )
    assert borttagen.status_code == 204
    return node_id


@pytest.mark.asyncio
async def test_borttagningsnotis_gar_att_kvittera(client, api_headers, repo):
    node_id = await _radera_nod(client, api_headers, "Notiskvittering – test")

    inkorg = await client.get("/api/v1/admin/notifications", headers=api_headers)
    assert inkorg.status_code == 200
    notiser = [d for d in inkorg.json()["node_deletions"] if d["node_id"] == node_id]
    assert len(notiser) == 1, "borttagningen lade ingen notis i inkorgen"

    kvittera = await client.delete(
        f"/api/v1/admin/notifications/node-deletions/{notiser[0]['id']}",
        headers=api_headers,
    )
    assert kvittera.status_code == 204

    efter = await client.get("/api/v1/admin/notifications", headers=api_headers)
    assert [d for d in efter.json()["node_deletions"] if d["node_id"] == node_id] == []

    # …men revisionsspåret finns kvar. Notisen är inte arkivet.
    async with repo._session_factory() as s:
        rader = (
            await s.execute(
                select(AuditLogORM).where(
                    AuditLogORM.entity_id == UUID(node_id),
                    AuditLogORM.action == "DELETE",
                )
            )
        ).scalars().all()
    assert rader, "kvitteringen tog med sig revisionsspåret"


@pytest.mark.asyncio
async def test_kvittering_av_okand_notis_ger_404(client, api_headers):
    resp = await client.delete(
        "/api/v1/admin/notifications/node-deletions/00000000-0000-0000-0000-000000000000",
        headers=api_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_kvittering_kraver_inloggning(client, api_headers):
    node_id = await _radera_nod(client, api_headers, "Notiskvittering – utan nyckel")
    inkorg = await client.get("/api/v1/admin/notifications", headers=api_headers)
    notis = next(d for d in inkorg.json()["node_deletions"] if d["node_id"] == node_id)

    resp = await client.delete(f"/api/v1/admin/notifications/node-deletions/{notis['id']}")
    assert resp.status_code == 401
