"""Egna rapporter (ea_custom_reports).

En rapport vars innehåll installationen läser in som data: nyckel, rubrik,
rapporttyp och rader. Beslut som fattas i rapporten sparas på raden.
"""
from __future__ import annotations

from alembic import op

revision = "0074"
down_revision = "0073"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS ea_custom_reports (
            key VARCHAR(80) PRIMARY KEY,
            title VARCHAR(200) NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            kind VARCHAR(30) NOT NULL,
            admin_only BOOLEAN NOT NULL DEFAULT true,
            rows JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_by VARCHAR(255)
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS ea_custom_reports")
