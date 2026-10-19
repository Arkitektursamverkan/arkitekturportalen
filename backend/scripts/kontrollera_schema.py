"""Kontrollerar att migreringarna och modellerna beskriver samma schema.

Körs mot en databas som just migrerats med `alembic upgrade head` (DATABASE_URL)
och jämför den med modellerna i app.models, som testerna bygger sitt schema
från. En skillnad betyder att en modelländring saknar migrering eller
tvärtom – och att testerna inte provar det schema installationerna har.

    alembic upgrade head && PYTHONPATH=. python scripts/kontrollera_schema.py
"""
from __future__ import annotations

import asyncio
import importlib
import pkgutil
import sys

from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy.ext.asyncio import create_async_engine

import app.models
from app.config import settings
from app.models.base import Base

for modul in pkgutil.iter_modules(app.models.__path__):
    importlib.import_module(f"app.models.{modul.name}")


def _jamfor(conn):
    ctx = MigrationContext.configure(conn, opts={"compare_type": True})
    return compare_metadata(ctx, Base.metadata)


async def main() -> int:
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.connect() as conn:
        skillnader = await conn.run_sync(_jamfor)
    await engine.dispose()
    if not skillnader:
        print("Migreringarna och modellerna beskriver samma schema.")
        return 0
    print(f"{len(skillnader)} skillnader mellan migreringarna och modellerna:")
    for s in skillnader:
        print(f"  {s!r}"[:300])
    return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
