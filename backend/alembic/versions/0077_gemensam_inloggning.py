"""Gemensam inloggning – en organisationsinställning.

NULL = miljövariabeln SHARED_LOGIN (av som förval).
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0077"
down_revision = "0076"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ea_org_settings", sa.Column("shared_login", sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column("ea_org_settings", "shared_login")
