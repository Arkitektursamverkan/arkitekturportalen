"""Installationens egna uppgifter (ea_installation).

Portalens publika adress, inlärd ur förfrågningarna när PDF_APP_BASE_URL inte
är satt, och Arkitektens adress, som Arkitekten anmäler vid start. Nyckel/värde.
"""
from __future__ import annotations

from alembic import op

revision = "0072"
down_revision = "0071"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS ea_installation (
            key VARCHAR(50) PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS ea_installation")
