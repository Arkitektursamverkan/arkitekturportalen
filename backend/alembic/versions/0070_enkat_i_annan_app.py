"""Enkät som besvaras i en annan app.

Kolumnen ea_surveys.answer_url: NULL betyder portalens eget formulär, så
befintliga enkäter fungerar som förut.
"""
from __future__ import annotations

from alembic import op

revision = "0070"
down_revision = "0069"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE ea_surveys ADD COLUMN IF NOT EXISTS answer_url VARCHAR(500)")


def downgrade() -> None:
    op.execute("ALTER TABLE ea_surveys DROP COLUMN IF EXISTS answer_url")
