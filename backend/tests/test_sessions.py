"""Sessioner och inloggning.

Kontraktet som låses här:
- Lokala token bär kontots tokenversion. Nytt lösenord och spärr höjer den, och
  token som utfärdats före slutar då gälla. Token utan versionen (utfärdade
  före ändringen) räknas som version 0 och gäller tills de går ut.
- Ett spärrat konto kan inte logga in, och dess token avvisas – Entra också.
- Okänd e-post och fel lösenord ger samma svar.
- Microsoft-inloggning kopplas aldrig automatiskt till ett lokalt konto (med
  lösenord); en admin kopplar det genom att ta bort lösenordet.
- B2B-gäster avvisas.
- BOOTSTRAP_ADMIN_EMAILS ger admin bara när det inte redan finns någon admin.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from sqlalchemy import select, update

from app import auth
from app.auth import AuthError, find_or_create_user, is_guest_account
from app.config import settings
from app.models.user import UserORM

PWD = "prov-losen-123"


def _epost(prefix: str = "s") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}@example.org"


async def _lokal(client, api_headers, role: str = "user") -> tuple[str, str, dict]:
    email = _epost()
    r = await client.post(
        "/api/v1/users", json={"name": "Sess Provsson", "email": email, "password": PWD, "role": role},
        headers=api_headers,
    )
    assert r.status_code == 201, r.text
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": PWD})
    assert login.status_code == 200, login.text
    return r.json()["id"], email, {"Authorization": f"Bearer {login.json()['token']}"}


@pytest.mark.asyncio
async def test_losenordsbyte_aterkallar_token(client, api_headers):
    uid, email, gammal = await _lokal(client, api_headers)
    assert (await client.get("/api/v1/users/me", headers=gammal)).status_code == 200

    r = await client.post(f"/api/v1/users/{uid}/password", json={"password": "nytt-losen-456"}, headers=api_headers)
    assert r.status_code == 200, r.text
    # REGRESSION: den gamla token gällde till den gick ut.
    assert (await client.get("/api/v1/users/me", headers=gammal)).status_code == 401

    ny = await client.post("/api/v1/auth/login", json={"email": email, "password": "nytt-losen-456"})
    assert ny.status_code == 200
    h = {"Authorization": f"Bearer {ny.json()['token']}"}
    assert (await client.get("/api/v1/users/me", headers=h)).status_code == 200


@pytest.mark.asyncio
async def test_token_utan_version_galler_som_version_0(client, repo):
    user = await repo.create_local_user(name="Gammal Token", email=_epost(), password_hash="x", role="user")
    now = datetime.now(UTC)
    payload = {
        "sub": str(user.id), "name": user.name, "email": user.email,
        "iss": auth.LOCAL_ISSUER, "aud": auth.LOCAL_AUDIENCE,
        "iat": int(now.timestamp()), "exp": int((now + timedelta(hours=1)).timestamp()),
        "jti": str(uuid.uuid4()),
    }
    token = jwt.encode(payload, settings.LOCAL_AUTH_SECRET, algorithm="HS256")
    r = await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_sparr_stoppar_inloggning_och_befintliga_token(client, api_headers):
    uid, email, h = await _lokal(client, api_headers)

    r = await client.put(f"/api/v1/users/{uid}/active", json={"active": False}, headers=api_headers)
    assert r.status_code == 200, r.text
    assert r.json()["is_active"] is False
    assert (await client.get("/api/v1/users/me", headers=h)).status_code == 401
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": PWD})
    assert login.status_code == 403

    r = await client.put(f"/api/v1/users/{uid}/active", json={"active": True}, headers=api_headers)
    assert r.json()["is_active"] is True
    # Den gamla token är fortfarande återkallad; en ny inloggning fungerar.
    assert (await client.get("/api/v1/users/me", headers=h)).status_code == 401
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": PWD})
    assert login.status_code == 200


@pytest.mark.asyncio
async def test_admin_kan_inte_sparra_sig_sjalv(client, api_headers):
    uid, _, h = await _lokal(client, api_headers, role="admin")
    r = await client.put(f"/api/v1/users/{uid}/active", json={"active": False}, headers=h)
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_bara_admin_far_sparra(client, api_headers):
    uid, _, _ = await _lokal(client, api_headers)
    _, _, annan = await _lokal(client, api_headers, role="superuser")
    r = await client.put(f"/api/v1/users/{uid}/active", json={"active": False}, headers=annan)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_okand_epost_och_fel_losenord_ger_samma_svar(client, api_headers, monkeypatch):
    _, email, _ = await _lokal(client, api_headers)
    checked: list[str] = []
    real = auth.verify_password

    def spy(plain: str, hashed: str) -> bool:
        checked.append(hashed)
        return real(plain, hashed)

    import app.api.v1.auth as auth_api
    monkeypatch.setattr(auth_api, "verify_password", spy)

    fel = await client.post("/api/v1/auth/login", json={"email": email, "password": "fel-losen-000"})
    okand = await client.post("/api/v1/auth/login", json={"email": _epost("okand"), "password": "fel-losen-000"})
    assert fel.status_code == okand.status_code == 401
    assert fel.json() == okand.json()
    # REGRESSION: en okänd adress svarade utan bcrypt-jämförelse, alltså fortare.
    assert len(checked) == 2 and checked[1] == auth.DUMMY_PASSWORD_HASH


# ── Entra ────────────────────────────────────────────────────────────────────

def _claims(email: str, **extra) -> dict:
    return {"oid": str(uuid.uuid4()), "preferred_username": email, "name": "Entra Provsson", **extra}


@pytest.mark.asyncio
async def test_entra_kopplas_inte_till_lokalt_konto(repo):
    email = _epost("lokal")
    lokal = await repo.create_local_user(name="Lokal", email=email, password_hash="x", role="admin")
    async with repo._session_factory() as s:
        # REGRESSION: en Entra-identitet med samma e-post tog över det lokala kontot.
        with pytest.raises(AuthError, match="administratör måste koppla"):
            await find_or_create_user(s, "entra", _claims(email))
        row = await s.get(UserORM, lokal.id)
        assert row is not None and row.entra_oid is None


@pytest.mark.asyncio
async def test_admin_kopplar_lokalt_konto_till_entra(client, repo, api_headers):
    uid, email, h = await _lokal(client, api_headers, role="superuser")
    r = await client.delete(f"/api/v1/users/{uid}/password", headers=api_headers)
    assert r.status_code == 200, r.text
    assert r.json()["is_local"] is False
    assert (await client.get("/api/v1/users/me", headers=h)).status_code == 401

    claims = _claims(email)
    async with repo._session_factory() as s:
        row = await find_or_create_user(s, "entra", claims)
        assert str(row.id) == uid and row.entra_oid == claims["oid"] and row.role == "superuser"
        await s.commit()


@pytest.mark.asyncio
async def test_forberett_konto_kopplas_som_forut(repo):
    email = _epost("forb")
    created, _ = await repo.provision_users([{"name": "Förberedd", "email": email, "role": "user"}])
    claims = _claims(email)
    async with repo._session_factory() as s:
        row = await find_or_create_user(s, "entra", claims)
        assert row.id == created[0].id and row.entra_oid == claims["oid"]
        await s.commit()


@pytest.mark.asyncio
async def test_sparrat_entra_konto_avvisas(repo):
    claims = _claims(_epost("entra"))
    async with repo._session_factory() as s:
        row = await find_or_create_user(s, "entra", claims)
        await s.commit()
        uid = row.id
    async with repo._session_factory() as s:
        await s.execute(update(UserORM).where(UserORM.id == uid).values(is_active=False))
        await s.commit()
    async with repo._session_factory() as s:
        with pytest.raises(AuthError, match="spärrat"):
            await find_or_create_user(s, "entra", claims)


@pytest.mark.asyncio
async def test_bootstrap_admin_bara_utan_admin(repo, monkeypatch):
    email = _epost("boot")
    monkeypatch.setattr(settings, "BOOTSTRAP_ADMIN_EMAILS", email)
    async with repo._session_factory() as s:
        har_admin = (await s.execute(select(UserORM.id).where(UserORM.role == "admin").limit(1))).first()
    if har_admin is None:
        await repo.create_local_user(name="Admin", email=_epost("adm"), password_hash="x", role="admin")
    async with repo._session_factory() as s:
        # REGRESSION: listan gav admin även när installationen redan hade en.
        row = await find_or_create_user(s, "entra", _claims(email))
        assert row.role == "user"
        await s.rollback()


@pytest.mark.asyncio
async def test_bootstrap_admin_nar_ingen_admin_finns(repo, monkeypatch):
    email = _epost("boot")
    monkeypatch.setattr(settings, "BOOTSTRAP_ADMIN_EMAILS", email)
    async with repo._session_factory() as s:
        # Inom transaktionen: inga administratörer (återställs med rollback).
        await s.execute(update(UserORM).where(UserORM.role == "admin").values(role="user"))
        row = await find_or_create_user(s, "entra", _claims(email))
        assert row.role == "admin"
        await s.rollback()


@pytest.mark.parametrize("claims, gast", [
    ({}, False),
    ({"acct": 0}, False),
    ({"acct": 1}, True),
    ({"idp": "https://sts.windows.net/11111111-2222-3333-4444-555555555555/"}, True),
    ({"idp": "live.com"}, True),
    ({"idp": "https://sts.windows.net/00000000-0000-0000-0000-00000000aaaa/"}, False),
    ({"tid": "00000000-0000-0000-0000-00000000aaaa"}, False),
    ({"tid": "99999999-0000-0000-0000-000000000000"}, True),
])
def test_gastkonton_kanns_igen(monkeypatch, claims, gast):
    monkeypatch.setattr(settings, "ENTRA_TENANT_ID", "00000000-0000-0000-0000-00000000aaaa")
    assert is_guest_account(claims) is gast
