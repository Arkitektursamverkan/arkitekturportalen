"""pytest fixtures — PostgreSQL test database."""
from __future__ import annotations

import os

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine

# Force postgres engine in tests
os.environ.setdefault("EA_DB_ENGINE", "postgres")
os.environ.setdefault("API_KEY", "test-key")
# The suite exercises every module; tests of the switch itself set it per test.
os.environ.setdefault("MODULES", "all")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")
# The test data is written with example.org addresses throughout.
os.environ.setdefault("ALLOWED_EMAIL_DOMAINS", "example.org")

from app.dal.postgres_repository import PostgresRepository
from app.dependencies import set_repository
from app.main import create_app
from app.models.base import Base

TEST_DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://ea_user:ea_pass@localhost:5432/ea_db_test",
)

_tables_created = False


@pytest_asyncio.fixture
async def repo():
    global _tables_created
    r = PostgresRepository(database_url=TEST_DB_URL)
    if not _tables_created:
        # Create tables once on first use
        async with r._engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        _tables_created = True
    # Built-in roles and default grants, as migration 0055 seeds them.
    await r.access.ensure_defaults()
    set_repository(r)
    yield r
    await r.close()


@pytest_asyncio.fixture
async def client(repo):
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
def api_headers():
    return {"X-Api-Key": "test-key"}


def pytest_sessionfinish(session, exitstatus):
    """Drop all tables after all tests complete."""
    import asyncio

    async def cleanup():
        engine = create_async_engine(TEST_DB_URL)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()

    try:
        asyncio.run(cleanup())
    except Exception:
        pass
