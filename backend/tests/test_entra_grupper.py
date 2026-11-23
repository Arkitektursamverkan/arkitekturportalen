"""Grupper kopplade till Entra – medlemmarna kommer från gruppanspråket.

Kontraktet som låses här:
- En grupp kan kopplas till en Entra-grupp (objekt-id, GUID). Två grupper kan
  inte ha samma Entra-grupp.
- Vid varje begäran med en Entra-token sätts användarens medlemskap i de
  kopplade grupperna efter token: med när Entra säger det, annars inte.
  Grupper utan koppling rörs aldrig.
- En token med för många grupper ("overage") ändrar ingenting.
- Medlemmarna i en kopplad grupp ändras inte för hand (409).
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.auth import entra_groups_in, find_or_create_user
from app.models.access import GroupMemberORM

ENTRA_A = "11111111-2222-3333-4444-555555555555"
ENTRA_B = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"


def _claims(**extra) -> dict:
    email = f"e-{uuid.uuid4().hex[:8]}@example.org"
    return {"oid": str(uuid.uuid4()), "preferred_username": email, "name": "Entra Provsson", **extra}


async def _grupp(client, api_headers, namn: str, **falt) -> dict:
    r = await client.post("/api/v1/access/groups", json={"name": namn, **falt}, headers=api_headers)
    assert r.status_code == 201, r.text
    return r.json()


async def _medlem_i(repo, user_id) -> set[str]:
    async with repo._session_factory() as s:
        rows = (await s.execute(select(GroupMemberORM.group_id).where(GroupMemberORM.user_id == user_id))).scalars()
        return {str(g) for g in rows}


async def _logga_in(repo, claims) -> uuid.UUID:
    async with repo._session_factory() as s:
        row = await find_or_create_user(s, "entra", claims)
        await s.commit()
        return row.id


def test_overage_kan_inte_saga_nagot():
    assert entra_groups_in({"groups": [ENTRA_A.upper()]}) == {ENTRA_A}
    assert entra_groups_in({}) == set()
    assert entra_groups_in({"_claim_names": {"groups": "src1"}}) is None
    assert entra_groups_in({"hasgroups": True}) is None


@pytest.mark.asyncio
async def test_medlemskapet_foljer_token(client, api_headers, repo):
    arkitektur = await _grupp(client, api_headers, "IT- och informationsarkitektur", entra_group_id=ENTRA_A.upper())
    assert arkitektur["entra_group_id"] == ENTRA_A
    hand = await _grupp(client, api_headers, "Handplockad")
    claims = _claims(groups=[ENTRA_A, ENTRA_B])
    uid = await _logga_in(repo, claims)
    assert await _medlem_i(repo, uid) == {arkitektur["id"]}
    # En handplockad grupp rörs inte av inloggningen.
    r = await client.put(f"/api/v1/access/groups/{hand['id']}/members", json={"user_ids": [str(uid)]}, headers=api_headers)
    assert r.status_code == 200, r.text
    # Ute ur Entra-gruppen: ute ur portalgruppen vid nästa begäran.
    await _logga_in(repo, {**claims, "groups": [ENTRA_B]})
    assert await _medlem_i(repo, uid) == {hand["id"]}
    # Overage: inget ändras.
    await _logga_in(repo, {**claims, "groups": None, "_claim_names": {"groups": "src1"}})
    assert await _medlem_i(repo, uid) == {hand["id"]}
    await _logga_in(repo, {**claims, "groups": [ENTRA_A]})
    assert await _medlem_i(repo, uid) == {hand["id"], arkitektur["id"]}
    # Grupplistan visar kopplingen och medlemmen.
    listad = next(g for g in (await client.get("/api/v1/access/groups", headers=api_headers)).json() if g["id"] == arkitektur["id"])
    assert [m["id"] for m in listad["members"]] == [str(uid)]


@pytest.mark.asyncio
async def test_kopplad_grupp_andras_inte_for_hand(client, api_headers, repo):
    g = await _grupp(client, api_headers, "Kopplad", entra_group_id=ENTRA_B)
    uid = await _logga_in(repo, _claims())
    r = await client.put(f"/api/v1/access/groups/{g['id']}/members", json={"user_ids": [str(uid)]}, headers=api_headers)
    assert r.status_code == 409
    # Samma Entra-grupp två gånger, ett felaktigt id, medlemmar vid skapandet: nej.
    assert (await client.post("/api/v1/access/groups", json={"name": "Dubblett", "entra_group_id": ENTRA_B}, headers=api_headers)).status_code == 400
    assert (await client.post("/api/v1/access/groups", json={"name": "Fel", "entra_group_id": "inte-ett-guid"}, headers=api_headers)).status_code == 422
    assert (await client.post("/api/v1/access/groups", json={"name": "Med", "entra_group_id": ENTRA_A, "member_ids": [str(uid)]}, headers=api_headers)).status_code == 422
    # Kopplingen tas bort med "": då går medlemmarna att ändra för hand igen.
    r = await client.patch(f"/api/v1/access/groups/{g['id']}", json={"entra_group_id": ""}, headers=api_headers)
    assert r.status_code == 200 and r.json()["entra_group_id"] is None
    r = await client.put(f"/api/v1/access/groups/{g['id']}/members", json={"user_ids": [str(uid)]}, headers=api_headers)
    assert r.status_code == 200
