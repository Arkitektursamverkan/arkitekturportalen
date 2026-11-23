"""Grupper kopplade till en Entra-grupp.

En grupp kan få en Entra-grupps objekt-id. Dess medlemmar sätts då av
inloggningen – gruppanspråket i token – och inte för hand (app/auth.py).
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0076"
down_revision = "0075"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ea_groups", sa.Column("entra_group_id", sa.String(36), nullable=True))
    op.create_index("ix_ea_groups_entra_group_id", "ea_groups", ["entra_group_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_ea_groups_entra_group_id", table_name="ea_groups")
    op.drop_column("ea_groups", "entra_group_id")
