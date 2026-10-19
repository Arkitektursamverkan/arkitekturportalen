"""Health check endpoint."""
from fastapi import APIRouter

from app.config import settings
from app.dependencies import get_repository
from app.schemas.common import HealthStatus

router = APIRouter()


@router.get("/health", response_model=HealthStatus, tags=["meta"])
async def health() -> HealthStatus:
    """Liveness + basic DB readiness check."""
    repo = get_repository()
    db_ok = False
    try:
        await repo.list_nodes(limit=1)
        db_ok = True
    except Exception:
        pass

    return HealthStatus(
        status="ok" if db_ok else "degraded",
        db_engine=settings.EA_DB_ENGINE,
        db_ok=db_ok,
        version=settings.APP_VERSION,
    )
