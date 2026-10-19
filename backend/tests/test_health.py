"""Health endpoint tests."""
import pytest

from app.config import settings


@pytest.mark.asyncio
async def test_health_ok(client):
    resp = await client.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("ok", "degraded")
    assert data["db_engine"] == "postgres"
    assert data["version"] == settings.APP_VERSION
