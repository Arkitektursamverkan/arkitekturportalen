"""Svaga hemligheter: kända standardlösenord för databasen stoppar starten i
produktion, precis som platshållare för API_KEY och LOCAL_AUTH_SECRET."""
from __future__ import annotations

import pytest

from app.config import Settings

STARK = "a" * 40


def _settings(**kw) -> Settings:
    base = {"API_KEY": STARK, "LOCAL_AUTH_SECRET": STARK, "EA_DB_ENGINE": "postgres",
            "DATABASE_URL": "postgresql+asyncpg://ea_user:Hemligt-och-langt-123@db:5432/ea_db",
            "NEO4J_PASSWORD": ""}
    base.update(kw)
    return Settings(_env_file=None, **base)


def test_starka_varden_godtas():
    assert _settings().weak_secrets() == []


@pytest.mark.parametrize("pw", ["ea_pass", "ea_password"])
def test_kanda_databaslosenord_flaggas(pw):
    s = _settings(DATABASE_URL=f"postgresql+asyncpg://ea_user:{pw}@db:5432/ea_db")
    assert "DATABASE_URL" in s.weak_secrets()


def test_neo4j_losenord_flaggas_bara_med_neo4j():
    assert "NEO4J_PASSWORD" not in _settings(NEO4J_PASSWORD="ea_password").weak_secrets()
    for pw in ("", "ea_password", "ea_pass"):
        assert "NEO4J_PASSWORD" in _settings(EA_DB_ENGINE="neo4j", NEO4J_PASSWORD=pw).weak_secrets()
    assert _settings(EA_DB_ENGINE="neo4j", NEO4J_PASSWORD="ett-eget-losenord").weak_secrets() == []
