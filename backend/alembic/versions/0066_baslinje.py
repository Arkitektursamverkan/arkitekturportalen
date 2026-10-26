"""Baslinje: hela schemat och grunddatan i ett steg.

Ersätter de tidigare migreringarna 0001–0066 (de finns kvar i det tidigare
repots historik). Schemat och grunddatan togs fram med pg_dump ur en databas byggd med
dem, så en ny installation får exakt samma databas som förut.

Revisionen heter 0066 som den sista av de gamla, så en databas som redan stod
på 0066 räknas som på baslinjen och fortsätter direkt med nästa migrering.

Revision ID: 0066
Revises: –
Create Date: 2026-10-19
"""
from __future__ import annotations

from pathlib import Path

from sqlalchemy.util import await_only

from alembic import op

revision = "0066"
down_revision = None
branch_labels = None
depends_on = None

BASLINJE = Path(__file__).resolve().parent.parent / "baslinje"


def _kor(fil: str) -> None:
    # pg_dump-utdata är många satser i följd och innehåller kolon i data
    # (tider, URL:er), så den skickas orörd till asyncpg i stället för genom
    # SQLAlchemys text() med dess parameterhantering. Samma anslutning och
    # samma transaktion som Alembic.
    sql = (BASLINJE / fil).read_text(encoding="utf-8")
    asyncpg_conn = op.get_bind().connection.driver_connection
    await_only(asyncpg_conn.execute(sql))


def upgrade() -> None:
    _kor("schema.sql")
    _kor("data.sql")


def downgrade() -> None:
    raise NotImplementedError("Baslinjen går inte att backa – återställ en backup i stället.")
