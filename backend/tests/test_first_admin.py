"""The first administrator is created on the first visit – and only then."""
import pytest

from app.config import settings
from app.dal.postgres_repository import PostgresRepository


async def _no_users(self) -> bool:
    return False


@pytest.mark.asyncio
async def test_not_needed_once_users_exist(client, repo):
    await repo.create_local_user(name="Finns", email="finns.forst@example.org", password_hash="x", role="user")
    resp = await client.get("/api/v1/auth/setup")
    assert resp.status_code == 200
    assert resp.json() == {"needed": False}

    resp = await client.post("/api/v1/auth/setup", json={
        "name": "Inkräktare", "email": "inkraktare@example.org", "password": "langtlosenord"})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_first_admin_created_and_signed_in(client, repo, monkeypatch):
    monkeypatch.setattr(PostgresRepository, "has_users", _no_users)
    monkeypatch.setattr(settings, "BOOTSTRAP_ADMIN_EMAILS", "")
    assert (await client.get("/api/v1/auth/setup")).json() == {"needed": True}

    resp = await client.post("/api/v1/auth/setup", json={
        "name": "Första Admin", "email": "Forsta.Admin@example.org", "password": "langtlosenord"})
    assert resp.status_code == 201
    token = resp.json()["token"]

    me = await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "forsta.admin@example.org"
    assert me.json()["role"] == "admin"


@pytest.mark.asyncio
async def test_only_bootstrap_addresses_may_claim_it(client, repo, monkeypatch):
    monkeypatch.setattr(PostgresRepository, "has_users", _no_users)
    monkeypatch.setattr(settings, "BOOTSTRAP_ADMIN_EMAILS", "chefen@example.org")
    resp = await client.post("/api/v1/auth/setup", json={
        "name": "Främling", "email": "framling@example.org", "password": "langtlosenord"})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_short_password_rejected(client, repo, monkeypatch):
    monkeypatch.setattr(PostgresRepository, "has_users", _no_users)
    resp = await client.post("/api/v1/auth/setup", json={
        "name": "Kort", "email": "kort@example.org", "password": "kort"})
    assert resp.status_code == 422
