"""Addresses in the forms docker compose and Render give them (app.internal_url)."""
import pytest

from app.config import Settings
from app.internal_url import api_base, asyncpg_url


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("", ""),
        (None, ""),
        ("  ", ""),
        ("http://plattform-api:8000/api/v1", "http://plattform-api:8000/api/v1"),
        ("http://plattform-api:8000/api/v1/", "http://plattform-api:8000/api/v1"),
        ("https://plattform.example.org/api/v1", "https://plattform.example.org/api/v1"),
        # Render's fromService hostport
        ("plattform-api-x7k2:8000", "http://plattform-api-x7k2:8000/api/v1"),
        (" plattform-api-x7k2:8000/ ", "http://plattform-api-x7k2:8000/api/v1"),
    ],
)
def test_api_base(raw, expected):
    assert api_base(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("postgresql+asyncpg://u:p@db:5432/ea_db", "postgresql+asyncpg://u:p@db:5432/ea_db"),
        # Render's connectionString
        ("postgresql://u:p@dpg-abc-a/ea_db", "postgresql+asyncpg://u:p@dpg-abc-a/ea_db"),
        ("postgres://u:p@host:5432/ea_db", "postgresql+asyncpg://u:p@host:5432/ea_db"),
        ("postgresql://u:p@host/ea_db?sslmode=require", "postgresql+asyncpg://u:p@host/ea_db?ssl=require"),
        ("sqlite+aiosqlite:///x.db", "sqlite+aiosqlite:///x.db"),
    ],
)
def test_asyncpg_url(raw, expected):
    assert asyncpg_url(raw) == expected


def test_settings_accept_a_managed_database_url():
    s = Settings(DATABASE_URL="postgresql://u:p@dpg-abc-a/ea_db")
    assert s.DATABASE_URL == "postgresql+asyncpg://u:p@dpg-abc-a/ea_db"
