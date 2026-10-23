"""FastAPI application factory with lifespan management."""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.config import settings
from app.dependencies import set_repository

log = structlog.get_logger(__name__)


def _configure_logging() -> None:
    import logging
    import structlog

    structlog.configure(
        processors=[
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
        ),
        logger_factory=structlog.PrintLoggerFactory(),
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Initialise and tear down the graph repository on startup/shutdown."""
    _configure_logging()

    weak = settings.weak_secrets()
    if weak and settings.APP_ENV not in ("development", "test"):
        raise RuntimeError(
            f"Refusing to start with APP_ENV={settings.APP_ENV}: {', '.join(weak)} "
            "is empty, a placeholder or shorter than 32 characters. "
            "Generate one with: openssl rand -hex 32"
        )
    if weak:
        log.warning("app.weak_secrets", settings=weak, note="only acceptable in development and test")
    from app import modules
    if modules.unknown(settings.MODULES):
        log.warning("app.unknown_modules", modules=modules.unknown(settings.MODULES), known=list(modules.KEYS))
    for key in modules.parse(settings.MODULES):
        if reason := modules.unavailable_reason(key):
            log.warning("app.module_unavailable", module=key, reason=reason)

    from app.dal.graph_repository import GraphRepository
    repo: GraphRepository
    if settings.EA_DB_ENGINE == "neo4j":
        from app.dal.neo4j_repository import Neo4jRepository
        repo = Neo4jRepository(
            uri=settings.NEO4J_URI,
            user=settings.NEO4J_USER,
            password=settings.NEO4J_PASSWORD,
        )
    else:
        from app.dal.postgres_repository import PostgresRepository
        repo = PostgresRepository(database_url=settings.DATABASE_URL)

    await repo.initialize()
    set_repository(repo)
    if settings.EA_DB_ENGINE == "postgres":
        from app.services import org_settings
        await org_settings.load(repo._session_factory)  # type: ignore[attr-defined]
    log.info("app.started", db_engine=settings.EA_DB_ENGINE)

    yield

    await repo.close()
    log.info("app.stopped")


def create_app() -> FastAPI:
    app = FastAPI(
        title="EA Tool API",
        description="Enterprise Architecture PoC — graph-based EA data store",
        version=settings.APP_VERSION,
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router)
    return app


app = create_app()
