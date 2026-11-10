"""Tokenversion och spärrade konton.

ea_users.token_version bäddas in i lokala token och höjs vid lösenordsbyte och
spärr, så att tidigare utfärdade token slutar gälla. ea_users.is_active = false
spärrar kontot. Befintliga konton får 0 och true – inget ändras för dem.
"""
from __future__ import annotations

from alembic import op

revision = "0071"
down_revision = "0070"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE ea_users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0"
    )
    op.execute(
        "ALTER TABLE ea_users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE ea_users DROP COLUMN IF EXISTS is_active")
    op.execute("ALTER TABLE ea_users DROP COLUMN IF EXISTS token_version")
