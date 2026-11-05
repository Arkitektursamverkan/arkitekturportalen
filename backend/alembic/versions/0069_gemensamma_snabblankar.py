"""Gemensamma snabblänkar.

Kolumnen ea_org_settings.shared_links: NULL betyder inga gemensamma länkar,
så en befintlig installation ser likadan ut efter uppgraderingen.
"""
from __future__ import annotations

from alembic import op

revision = "0069"
down_revision = "0068"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE ea_org_settings ADD COLUMN IF NOT EXISTS shared_links JSONB")


def downgrade() -> None:
    op.execute("ALTER TABLE ea_org_settings DROP COLUMN IF EXISTS shared_links")
